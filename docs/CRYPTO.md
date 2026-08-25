# Crypto core

This document covers the key hierarchy, parameter choices and their rationale, and the upgrade path. The platform-agnostic implementation lives in [`packages/core/src/crypto/`](../packages/core/src/crypto); the native binding behind it lives in [`apps/mobile/src/crypto/`](../apps/mobile/src/crypto).

## Library

[`react-native-quick-crypto`](https://github.com/margelo/react-native-quick-crypto) — JSI bindings over native OpenSSL/BoringSSL (statically linked, OpenSSL 3.6.2 on Android at the time of writing). Not a pure-JS polyfill: PBKDF2, AES-256-GCM, CSPRNG, and Argon2 all execute in native code.

`packages/core/src/crypto` never imports `react-native-quick-crypto` directly — it only knows the platform-agnostic `CryptoProvider` interface ([`CryptoProvider.ts`](../packages/core/src/crypto/CryptoProvider.ts)). `apps/mobile`'s concrete implementation ([`nativeCryptoProvider.ts`](../apps/mobile/src/crypto/nativeCryptoProvider.ts)) is the only place that touches the real binding, itself routed through a single seam ([`apps/mobile/src/crypto/native.ts`](../apps/mobile/src/crypto/native.ts)) that Jest substitutes with a Node-`crypto`-backed test double (`apps/mobile/src/crypto/__mocks__/native.ts`) — see the Testing section below for exactly what that does and doesn't prove.

## Key hierarchy (envelope encryption)

```
master password ──PBKDF2 or Argon2id──► KEK (256-bit)
                                            │
random 256-bit DEK ─────────────────────────┴──AES-256-GCM wrap──► wrapped DEK blob (in vault header)
        │
        └── AES-256-GCM encrypts every vault record, one fresh IV per record
```

- **KEK (Key Encryption Key):** derived from the master password + a per-vault salt + KDF params. Never stored. Re-derived on every unlock.
- **DEK (Data Encryption Key):** a random 256-bit key, generated once via CSPRNG (`generateDek()` in [`envelope.ts`](../packages/core/src/crypto/envelope.ts)), never derived from the password. Wrapped (AES-256-GCM-encrypted) under the KEK and stored in the vault header. Unwrapped into memory on unlock, used to encrypt/decrypt every record.

Both the KEK and DEK are opaque `KeyHandle` values, not raw bytes the app ever reads — see the `CryptoProvider` interface. Native's `KeyHandle` is a `Buffer` under the hood, zeroed on disposal; a future web implementation backs it with a non-extractable `CryptoKey`, where disposal is a no-op because the page never held the bytes to begin with.

Splitting KEK and DEK is what makes password changes and KDF-parameter upgrades cheap: only the small wrapped-DEK blob gets re-wrapped, not every record in the vault.

## Parameters

| Parameter | Value | Rationale |
|---|---|---|
| KDF | PBKDF2-HMAC-SHA256 | OWASP-floor default; see the Argon2id section below for the proposed alternative |
| PBKDF2 iterations | 310,000 | OWASP 2023 recommended minimum for PBKDF2-HMAC-SHA256 |
| KDF salt | 32 random bytes, CSPRNG | Exceeds the 16-byte NIST SP 800-132 floor |
| DEK / KEK size | 256-bit | AES-256 |
| Cipher | AES-256-GCM | Authenticated encryption; industry standard, hardware-accelerated on both platforms |
| GCM IV | 96-bit (12 bytes), fresh CSPRNG per encryption | NIST SP 800-38D recommended IV length; a fresh random IV per encryption keeps reuse-under-a-key probability negligible at any realistic vault size |
| GCM auth tag | 128-bit, always verified | Full-strength tag; never truncated |

Randomness for all of the above (salts, DEK, IVs) comes from `randomBytes()` in [`csprng.ts`](../packages/core/src/crypto/csprng.ts), which routes through the platform's `CryptoProvider`. `Math.random()` is never used anywhere in the crypto path.

## Master password verification

There is no stored password hash anywhere in this app. Verification *is* attempting to unwrap the DEK: the correct password derives the KEK that unwraps it, and GCM's authentication tag either succeeds or fails. A wrong password produces a KEK that fails the tag check, which surfaces as the same `DecryptionError` as a corrupted or tampered blob — see `unwrapKey()` in [`envelope.ts`](../packages/core/src/crypto/envelope.ts). This is deliberate: one less secret at rest, one less place to get the comparison wrong.

## AAD binding

Every AES-256-GCM operation in this app passes additional authenticated data (AAD):

- **Records** are bound to their record ID and schema version (`recordAad()` in [`cipher.ts`](../packages/core/src/crypto/cipher.ts)), so a ciphertext can't be swapped between records or replayed against a different schema version. The encoding is length-prefixed (4-byte record-ID length, 4-byte schema version, then the ID bytes) rather than a delimited string like `${id}:${version}` — a delimited join is ambiguous (`id="a:1", version=2` and `id="a", version="1:2"` collide), and 3-line KAT-style tests exist for exactly this case.
- **The wrapped DEK** is bound to the vault ID and the KDF-params version (`dekWrapAad()` in [`envelope.ts`](../packages/core/src/crypto/envelope.ts)), so a wrapped DEK can't be moved to a different vault header or paired with stale KDF params.

## KDF-parameter upgrade path

The vault header stores the KDF algorithm, its parameters, and the salt, specifically so those can be strengthened later without re-encrypting the vault. `upgradeKdfParams()` in [`envelope.ts`](../packages/core/src/crypto/envelope.ts) implements this now, even though nothing calls it yet:

1. Re-derive the old KEK from the master password + old params, unwrap the DEK (this also re-verifies the password).
2. Generate a fresh salt, derive a new KEK under the new params.
3. Re-wrap the *same* DEK under the new KEK.
4. Return the new wrapped DEK + params + salt for the caller to persist.

Vault records are untouched — only the small envelope around the DEK changes. This is also how switching KDF algorithm (PBKDF2 → Argon2id) would work, not just raising iteration counts.

## Recommendation: Argon2id as an opt-in alternative to PBKDF2

PBKDF2-HMAC-SHA256 at 310k iterations meets the spec I was given and the OWASP floor, but it is not memory-hard — GPUs and ASICs parallelize it far more cheaply than they can Argon2id. `react-native-quick-crypto` has a **native** Argon2id binding (OpenSSL 3.2+'s Argon2 provider, gated behind `OPENSSL_VERSION_NUMBER >= 0x30200000L` in the library's C++), so this isn't a pure-JS fallback — the audited-native-only bar the project spec sets is met.

It's implemented — `deriveKek()` supports `kdf: 'argon2id'` in the header format already — but **PBKDF2 stays the default for new vaults**, per the instruction to propose this rather than silently switch defaults. If you want Argon2id as the default going forward:

- Suggested starting params: memory 19,456 KiB (19 MiB), 2 passes, parallelism 1 — OWASP's current password-hashing recommendation for Argon2id. These are cheap to raise later via the same upgrade path.
- Existing PBKDF2 vaults are unaffected either way; the header format already carries the KDF choice per-vault.

## Testing

- **PBKDF2:** known-answer tests against the two official RFC 7914 §11 vectors. Fetched directly from `rfc-editor.org` and parsed programmatically — not hand-transcribed, and not taken from a summarized fetch (see the fixture file's header comment for why that distinction mattered in practice: an early hand-copy from a summarized fetch introduced a transcription error that a live independent computation caught).
- **AES-256-GCM:** a known-answer vector sourced from the Go standard library's NIST-CAVP-derived `aesGCMTests` table, parsed programmatically from the raw source file and cross-checked byte-for-byte against the written fixture.
- **IV uniqueness:** 100,000 encryptions under one key, asserting no repeated IV.
- **Fail-closed behavior:** flipped ciphertext byte, flipped auth-tag byte, wrong AAD, wrong key, wrong master password — all assert `DecryptionError`, never partial plaintext.
- **Argon2id:** exercised through `hash-wasm`'s WASM implementation in the test double (structural/round-trip only). This validates parameter marshalling but **not** react-native-quick-crypto's native Argon2id binding, and is **not** verified against RFC 9106's official Argon2id test vectors. That requires an on-device or simulator run — see the device verification checklist below.
- **Shared conformance suite:** `packages/core/src/testing/cryptoProviderConformance.ts` runs the same suite (KAT vectors, IV uniqueness, tamper detection, non-KeyHandle-leakage) against every concrete `CryptoProvider`. As of this writing every registered run resolves to Node's `crypto` under the hood (the reference provider directly, and `apps/mobile`'s provider only through the Jest mock above) — it is one implementation checked against itself until a real device run and a web WebCrypto provider are both in the mix. See that file's own doc comment before trusting a green result here as cross-implementation proof.

## Device verification checklist

Nothing above involving react-native-quick-crypto's **actual native binding** — as opposed to its Jest test double — has been exercised outside this checklist. Two things specifically depend on it and cannot be verified any other way:

### 1. The legacy-storage migration shim (`apps/mobile/src/storage/nativeSecureStore.ts`)

The shim assumes real MMKV's `getBuffer()` returns `undefined` for a key that was written via `set(key, string)`, the way the Jest mock does. If real MMKV instead returns that string's UTF-8 bytes, the fallback never fires and a pre-migration vault fails to open with a `DecryptionError` indistinguishable from a wrong password — the exact bug the shim exists to fix, now hidden behind tests that only prove the *mocked* behavior.

**This test installs a new build over a vault it might not be able to open — always have a recovery path that doesn't depend on the thing under test.**

**Steps:**
1. Build and install the pre-migration app: `git checkout pre-monorepo-native`, then `npm install && npx react-native run-android` (this predates the workspace split, so it's a plain single-package RN app — no `apps/mobile` prefix).
2. Create a vault, add 2-3 credentials, enable biometric unlock if you want to also check that setting survives.
3. **Step 0a — export an escape hatch before going any further.** From this same pre-migration build, export a `.flbx` backup of the vault and save it somewhere off-device (it's the one artifact this whole test can't corrupt, since it's produced *before* the build under test ever touches the vault). If the migration shim turns out to be broken and the vault won't open after step 5 below, this file — not the vault, not the shim, not anything this upgrade path depends on — is the recovery path. Skipping this step means a broken shim costs you the vault, not just the test.
4. Check out the current branch (`git checkout monorepo-migration`), install over the same device (`cd apps/mobile && npx react-native run-android` — this reinstalls over the existing app rather than uninstalling first, so the vault persists) without uninstalling the app first.
5. Unlock with the same password. **This must succeed.** Confirm the credentials added in step 2 are all present and correct. If it fails, do not troubleshoot in place — restore from the step 0a backup on a clean install, then report the failure.
6. Look at logcat (`adb logcat | grep flintlock`) for the `[flintlock] Migrating legacy string-encoded storage key ...` warning. Expect it **twice**: once for `vault:header` (read eagerly by `open()`) and once for `vault:index` (read lazily, the first time something lists credentials) — the fallback is per-key with no shared "only once ever" flag, so N legacy keys warn N times total, never again after each key's own first successful read.

### 2. Cross-implementation `.flbx` parity (real native binding vs. Node reference provider)

See `packages/core/src/export/__tests__/deviceCrossImplementation.test.ts` for the exact steps and the fixture this test consumes once populated — it decrypts a `.flbx` file actually produced by react-native-quick-crypto's native binding using packages/core's Node-backed reference provider, which is the first real cross-implementation check the project has had (everything else currently checks Node's crypto against itself).

## What this doesn't cover yet

Biometric unlock (native path is implemented; WebAuthn PRF/largeBlob for web is pending real-hardware testing), storage layer beyond the migration shim above, and Web Bridge each have their own key material and are documented separately.
