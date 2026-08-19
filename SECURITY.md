# Security

This document is written incrementally as Flintlock is built — it covers what exists today, not the full product vision. See [docs/CRYPTO.md](docs/CRYPTO.md) for the cryptographic detail and [README.md](README.md) for what Flintlock is.

## What Flintlock protects against

- **A stolen or lost device, screen locked, app closed.** Vault contents are encrypted at rest under a key that only exists after a correct master password (or biometric-released hardware key, once built) unwraps it.
- **A vault file copied off the device.** Without the master password, the wrapped DEK cannot be unwrapped and the vault contents cannot be decrypted or tampered with undetected — every ciphertext is AES-256-GCM-authenticated.
- **Network-based attacks in general.** There is no backend and no account. Nothing about the vault is transmitted anywhere except the explicit, user-initiated Web Bridge transfer and export flows (not yet built), which will get their own threat model documents before implementation.
- **Silent tampering or corruption.** Every decryption path fails closed: a bad auth tag, wrong AAD, or wrong key all produce the same hard error and never a partial or best-effort plaintext result. See `DecryptionError` in [`src/crypto/types.ts`](src/crypto/types.ts).

## What Flintlock does not protect against

Stated plainly, per the project's own instruction that overclaiming is worse than a missing feature:

- **A rooted or jailbroken device.** OS-level compromise can read process memory, defeating any in-memory key material regardless of how carefully it's handled.
- **A compromised OS or malicious accessibility service** that can read the screen, log keystrokes, or extract data through legitimate OS APIs.
- **Hardware keyloggers** or physical observation of the master password being entered.
- **Physical coercion** to unlock the vault. There is no duress PIN or hidden-vault feature in scope.
- **A forgotten master password.** By design (see the project's out-of-scope list) — there is no recovery, reset, or backdoor. Losing the master password means losing the vault, and onboarding will say so plainly before a vault is ever created.
- **Sophisticated cold-boot or DMA attacks against device RAM.** Out of scope for a mobile app threat model; mitigated only incidentally by the memory-hygiene practices below, not defended against directly.

## Memory hygiene, honestly

The spec calls for zeroing key material and decrypted plaintext buffers after use wherever the language allows it, and for documenting the limitation honestly where it doesn't. Concretely, as implemented today:

- **Buffers are zeroed where we control the lifetime.** `envelope.ts`'s `upgradeKdfParams()` calls `.fill(0)` on the old KEK, new KEK, and DEK in `finally` blocks once they're no longer needed. The same pattern will extend to the unlock/lock flow once it's built (Phase 3).
- **JavaScript strings are immutable and cannot be zeroed.** If a master password ever passes through a JS `string` (rather than a `Buffer`) at any point — a text input's value, a function argument typed as `string` — that string's backing memory is not reachable for overwriting and persists until the garbage collector happens to reclaim it, on its own schedule, with no guarantee about *when* or whether the memory is overwritten before reuse. This is a real, unfixable limitation of the runtime, not an oversight: `src/crypto`'s functions all take `Buffer`, never `string`, for exactly this reason, but the UI layer that reads the password out of a text field will still touch a JS string at least once before it can be converted. That gap is inherent to building this app in JavaScript/React Native rather than a language with manual memory control, and no amount of `.fill(0)` elsewhere closes it.
- **Native crypto operations happen in C++ (OpenSSL), outside the JS heap**, for the duration of the actual PBKDF2/Argon2id/AES-GCM computation — but the buffers marshalled across the JSI boundary are still JS-heap-allocated `Buffer` objects on the way in and out.

## Reporting

This is a pre-1.0 project without a public release yet; there's no external reporting process to document at this stage.
