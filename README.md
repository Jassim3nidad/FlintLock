# Flintlock

An offline-first password manager and 2FA authenticator. *A flintlock fires without external power — your vault works without a server.*

There is no backend, no account, and no sync service. Vault data never leaves the device except through an explicit, user-initiated export or [Web Bridge](docs/WEB_BRIDGE_THREAT_MODEL.md) transfer. See [SECURITY.md](SECURITY.md) for the full threat model, and [docs/CRYPTO.md](docs/CRYPTO.md) for the key hierarchy and parameter choices.

## Stack

- **Platform:** React Native (bare workflow), TypeScript. Android first, iOS second.
- **Crypto:** [`react-native-quick-crypto`](https://github.com/margelo/react-native-quick-crypto) (JSI, native OpenSSL/BoringSSL-backed) for AES-256-GCM, PBKDF2-HMAC-SHA256, and CSPRNG. `react-native-argon2` (native) as the proposed Argon2id upgrade path — see [docs/CRYPTO.md](docs/CRYPTO.md).
- **Minimum OS:** Android 8.0 (API 26)+, iOS 15.0+.

## Prerequisites

Follow the React Native [Set Up Your Environment](https://reactnative.dev/docs/set-up-your-environment) guide for Android (and, on macOS, iOS). You'll need Node 22+, a JDK, the Android SDK, and (for iOS) Xcode + CocoaPods.

## Build & run

```sh
npm install

# Android
npm run android

# iOS (macOS only — installs CocoaPods first)
bundle install
bundle exec pod install
npm run ios
```

Metro (the JS bundler) starts automatically with the above; to run it standalone: `npm start`.

## Verify

```sh
npm run typecheck   # tsc --noEmit
npm run lint         # eslint
npm test             # jest — includes crypto known-answer-test vectors
npm run scan-secrets # what the pre-commit hook runs
```

A pre-commit hook (`.husky/pre-commit`, backed by [`scripts/security/scan-secrets.js`](scripts/security/scan-secrets.js)) scans staged files for credential patterns and high-entropy strings and blocks the commit if it finds any. False positives can be silenced per-line with a trailing `// pragma: allowlist secret` comment, or per-file via `.secret-scan-ignore`.

## Project structure

Documented as it's built. See [docs/](docs) for format specs and threat models, and [SECURITY.md](SECURITY.md) for what Flintlock does and does not protect against.
