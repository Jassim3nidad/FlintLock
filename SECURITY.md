# Security

This document is written incrementally as Flintlock is built — it covers what exists today, not the full product vision. See [docs/CRYPTO.md](docs/CRYPTO.md) for the cryptographic detail and [README.md](README.md) for what Flintlock is.

## What Flintlock protects against

- **A stolen or lost device, screen locked, app closed.** Vault contents are encrypted at rest under a key that only exists after a correct master password — or, if enabled, a biometric-released hardware key — unwraps it. The vault also auto-locks (idle timer, always; on app backgrounding, configurably; on device lock, always — see `src/unlock/session.ts`), wiping the DEK from memory each time.
- **A vault file copied off the device.** Without the master password, the wrapped DEK cannot be unwrapped and the vault contents cannot be decrypted or tampered with undetected — every ciphertext is AES-256-GCM-authenticated.
- **Network-based attacks in general.** There is no backend and no account. Nothing about the vault is transmitted anywhere except the explicit, user-initiated Web Bridge transfer and export flows. Web Bridge got its own threat model, reviewed and approved before implementation — see [docs/WEB_BRIDGE_THREAT_MODEL.md](docs/WEB_BRIDGE_THREAT_MODEL.md).
- **Silent tampering or corruption.** Every decryption path fails closed: a bad auth tag, wrong AAD, or wrong key all produce the same hard error and never a partial or best-effort plaintext result. See `DecryptionError` in [`src/crypto/types.ts`](src/crypto/types.ts).

## TOTP/HOTP secret storage and clock drift

TOTP/HOTP shared secrets (`src/storage/schema.ts`'s `TotpEntry.secret`) are vault records like any other — AES-256-GCM-encrypted with the same DEK, AAD-bound to their record id, subject to the same fail-closed decryption as credentials. There is no separate key or weaker path for authenticator secrets.

`src/totp/clockDrift.ts`'s drift warning only detects **sudden, large** jumps in the device's wall clock (comparing it against real elapsed time between two timer ticks) — it cannot detect small, gradual clock skew, which would need a trusted external time source (NTP), and fetching one is a network call this app doesn't make. If the UI ever surfaces this warning, its copy should say the clock looks off, not that it's the reason a code is wrong — the monitor genuinely can't tell the difference between "wrong because of drift" and "wrong for some other reason."

## Web Bridge

The pairing-secret generation, QR/manual-entry encoding, HKDF session-key derivation, message encryption, and the session state machine (`src/webbridge/`) are implemented and unit-tested to the same standard as the rest of the app — 35 tests covering single-use enforcement, timeout, explicit consent gating, memory zeroing on teardown, and fail-closed message decryption.

**The actual local HTTP/WebSocket listener is not yet implemented.** It needs a native TCP/WebSocket server module React Native doesn't provide out of the box, and — more fundamentally — can only be genuinely verified with two real devices on a real LAN, which this environment doesn't have. Claiming Web Bridge "works" before that piece exists and has been tested against real hardware would be exactly the kind of overclaiming this document tries to avoid. Until then, nothing about this feature can transmit data anywhere; the session-management code exists, but nothing is listening on any port.

## Export / Import

`.flbx` export (`src/export/flbxService.ts`) encrypts every vault record under a key derived fresh from a re-entered master password — independent of the vault's own DEK/KEK, so a leaked export never bears on the live vault or vice versa (see [docs/FLBX_FORMAT.md](docs/FLBX_FORMAT.md)). CSV and KeePass-XML export are plaintext by design (that's the point of an interchange format another tool can read) and are gated behind a blocking in-app warning the user must explicitly acknowledge before the file is generated, on top of the same master-password re-entry required for every export format. `.flbx` import previews every record's add/update/unchanged classification against the live vault before anything is written, and supports merge or full-replace once confirmed.

**Getting the resulting bytes on or off the device is a known, explicitly-flagged gap.** Sharing an export currently goes through React Native core's own `Share` API (`src/files/native.ts`) — real and functional, but text-only, so the binary `.flbx` output is base64-encoded first; there's no file actually written to disk yet, only handed to the OS share sheet. Picking a file back in for import has no built-in React Native equivalent at all and needs a native document-picker module, which isn't installed — `fileSystem.pickFile()` throws rather than silently pretending to succeed. Closing this gap needs a dependency decision (e.g. `react-native-document-picker` plus a real filesystem-write module) that hasn't been made yet.

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

- **Buffers are zeroed where we control the lifetime.** `envelope.ts`'s `upgradeKdfParams()` calls `.fill(0)` on the old KEK, new KEK, and DEK in `finally` blocks once they're no longer needed. `VaultStore.lock()` and every path through `UnlockSession.lock()` (idle timeout, backgrounding, device lock, manual) do the same to the DEK.
- **JavaScript strings are immutable and cannot be zeroed.** If a master password ever passes through a JS `string` (rather than a `Buffer`) at any point — a text input's value, a function argument typed as `string` — that string's backing memory is not reachable for overwriting and persists until the garbage collector happens to reclaim it, on its own schedule, with no guarantee about *when* or whether the memory is overwritten before reuse. This is a real, unfixable limitation of the runtime, not an oversight: `src/crypto`'s functions all take `Buffer`, never `string`, for exactly this reason, but the UI layer that reads the password out of a text field will still touch a JS string at least once before it can be converted. That gap is inherent to building this app in JavaScript/React Native rather than a language with manual memory control, and no amount of `.fill(0)` elsewhere closes it.
- **Native crypto operations happen in C++ (OpenSSL), outside the JS heap**, for the duration of the actual PBKDF2/Argon2id/AES-GCM computation — but the buffers marshalled across the JSI boundary are still JS-heap-allocated `Buffer` objects on the way in and out.

## Biometric unlock

Biometric unlock (`src/biometric/biometricVault.ts`) delegates the actual hardware-backed key generation, wrapping, and biometric gating to [`react-native-keychain`](https://github.com/oblador/react-native-keychain) — configured with `ACCESS_CONTROL.BIOMETRY_CURRENT_SET` (invalidates on any new biometric enrollment) and, on Android, `STORAGE_TYPE.AES_GCM` (requires authentication for both wrap and unwrap) at `SECURITY_LEVEL.SECURE_HARDWARE`. Flintlock does not implement its own Keystore/Secure Enclave key generation — it stores a copy of the DEK through this library rather than manually managing a second native key itself. The master password remains the only recovery path; disabling or losing biometric enrollment never locks a vault permanently, it just falls back to the password.

**Unverified as of this writing:** the logic in `biometricVault.ts` (which options get passed, how a declined/failed prompt is distinguished from a genuine error, service naming) is tested against a controllable fake — see `src/biometric/__mocks__/native.ts`'s own header comment. Whether `react-native-keychain`'s native code actually produces a hardware-backed, biometric-invalidating key on a real device requires an on-device or simulator run with real biometric enrollment, which hasn't been possible yet (see the phase report for why).

## Platform hardening

- **Screenshot / task-switcher protection.** Android sets `FLAG_SECURE` on the activity window at creation (`android/app/src/main/java/com/flintlock/MainActivity.kt`), which blocks both screenshots/screen recording and the recent-apps thumbnail. iOS has no direct equivalent flag, so `AppDelegate.swift` instead covers the window with a blur (`UIVisualEffectView`) in `applicationWillResignActive` and removes it in `applicationDidBecomeActive` — the same moment iOS would otherwise capture the app-switcher snapshot. Applied unconditionally rather than per-screen: every screen in this app can show vault contents, so there's no lower-sensitivity screen to exempt.
- **No cloud backup, for real.** Android's `AndroidManifest.xml` sets `android:allowBackup="false"`, which disables the OS backup mechanism entirely — nothing in the app's data directory, MMKV included, is ever eligible. iOS has no app-wide equivalent; instead, `AppDelegate.swift` explicitly marks the MMKV storage directory (`Documents/mmkv` — see `node_modules/react-native-mmkv/ios/HybridMMKVPlatformContext.swift` for why that's the path) with `NSURLIsExcludedFromBackupKey` at every launch, created proactively so the flag is in place before MMKV's first write rather than racing it. Vault content there is already our own AES-256-GCM ciphertext, never plaintext, but the spec's invariant is that it shouldn't leave the device via backup at all, encrypted or not.
- **Permission audit.** iOS's `Info.plist` previously carried an empty, unused `NSLocationWhenInUseUsageDescription` left over from the React Native template — removed, since Flintlock has no location feature and no location-using dependency. Added `NSFaceIDUsageDescription`, which Face ID unlock genuinely needs and was missing (iOS refuses the Face ID prompt without it). Android's manifest declares only `INTERNET`, commented in place to explain it's staged for the approved-but-deferred Web Bridge feature rather than anything the app uses today.

**Unverified as of this writing**, same constraint as everything else native in this project: these are ordinary, well-documented platform APIs (`FLAG_SECURE`, `UIVisualEffectView`, `NSURLIsExcludedFromBackupKey`) used the standard way, but confirming they behave correctly — the blur actually appears in the app switcher, the screenshot is actually blocked, the backup actually excludes the directory — needs a real on-device or simulator run, which hasn't been possible in this environment (see the Android build note in the phase reports for why).

## Reporting

This is a pre-1.0 project without a public release yet; there's no external reporting process to document at this stage.
