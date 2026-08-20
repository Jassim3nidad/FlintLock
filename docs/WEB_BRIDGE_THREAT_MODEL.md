# Web Bridge threat model

**Status: approved.** The architecture below, including a full 256-bit pairing secret for both the QR and manual-entry paths, was reviewed and approved before implementation began. See [`src/webbridge/`](../src/webbridge) for the implementation and its own notes on what is and isn't machine-verifiable without a working on-device build.

## What it is

A one-time, local-network-only transfer of a single credential from the phone to a desktop browser tab, so a user can paste a password into a desktop login form without retyping it. No relay, no cloud, no account, no NAT traversal — if the phone and desktop aren't on the same LAN, it doesn't work, by design.

## Architecture (why it has to look this way)

There is no server anywhere in this product, and the spec is explicit that Web Bridge must not introduce one. That constrains the design to exactly one shape: **the phone itself is the server.**

1. The user taps "Transfer to desktop" on the phone. The app starts a short-lived local HTTP/WebSocket listener bound to the phone's current LAN IP, on an ephemeral port.
2. The phone generates a random 256-bit pairing secret and displays a QR code encoding `{ip, port, pairingSecret, expiresAt}`. A manual-entry fallback (base32 text) is also shown for devices that can't scan.
3. The desktop browser scans the QR (or the user types the code) and navigates directly to `http://<phone-ip>:<port>/`, served by the phone. That page is a small, fully self-contained HTML/JS bundle the phone serves — it is not fetched from anywhere else, and once loaded it needs no further requests to any third party.
4. The desktop page and the phone establish an application-layer encrypted channel keyed by the pairing secret (never the plain HTTP transport — see "Crypto design" below).
5. The user picks what to send *on the desktop*; the phone shows an explicit consent screen naming exactly that item and requires a tap to approve before anything decrypted crosses the wire.
6. The session tears down — listener stopped, key material zeroed — on completion, on timeout (2–5 minutes, TBD exact value), or if the app backgrounds.

The QR encodes a literal IP address, not a hostname. **No mDNS/Bonjour, no service discovery broadcast, no DNS lookup of any kind is used anywhere in this flow.** That's a deliberate design choice, not an oversight — see "DNS/mDNS spoofing" below.

## Crypto design

- Pairing secret: 256-bit, CSPRNG-generated, encoded once into the QR code and the manual-entry fallback text. Never transmitted over the network in any form — not in the clear, not hashed, not as a key-exchange parameter. Its only channel is optical (QR) or manual transcription.
- Session key: `HKDF(pairingSecret, salt=sessionId, info="flintlock-web-bridge-v1")` → a 256-bit AES-GCM key, used by both sides for the whole session.
- Every message either direction: AES-256-GCM, fresh random IV per message, same discipline as the rest of the app's crypto (`src/crypto/cipher.ts`).
- **No PAKE, no asymmetric handshake beyond this.** The security property this leans on: an attacker who can observe or even actively intercept every packet on the LAN still cannot derive the session key without the pairing secret, and cannot forge a validly-authenticated message without it either (GCM auth tag fails deterministically). The very first message the desktop page sends must already be correctly encrypted under the derived key — if it isn't, the phone drops the connection without responding (never confirms or denies *why* it failed, to avoid a probing oracle).
- **Decided:** the manual-entry fallback uses the same full 256-bit secret as the QR path (~52 base32 characters). One code path, one security level — manual entry is a rare fallback, not the primary path, so the typing cost is acceptable.

## Threats considered

### Passive network sniffing (e.g. shared café WiFi)

An attacker capturing all WiFi traffic sees: the initial plaintext HTTP page load (the static HTML/JS shell only — it contains no secrets, since the pairing secret arrives via QR/manual entry, not the network) and then only AES-256-GCM ciphertext for every subsequent message. **Mitigated** — nothing sensitive is ever on the wire unencrypted.

### Active MITM during pairing

An attacker positioned to intercept and relay every packet between phone and desktop (ARP spoofing, rogue AP, etc.) still does not have the pairing secret — it never crossed the network. They can relay ciphertext back and forth, or drop it, but cannot decrypt it or construct a message that passes the GCM auth tag. **Mitigated for confidentiality and integrity.** Not mitigated for availability — an on-path attacker can always deny service (drop packets, refuse to relay) — but denial of service here just means the transfer fails, not that anything leaks. Consistent with the project's stance that DoS resistance is out of scope.

### Malicious device on the same LAN (not on-path, just present)

Same secret-based protection applies — presence on the LAN alone gives no advantage without the pairing secret. Two residual risks worth naming:
- **Port/service discovery:** a device scanning the LAN's open ports could find the phone's listener and attempt to connect. The phone must not respond usefully to any unauthenticated request — no banner, no version string, nothing beyond "connection accepted, awaiting an encrypted first message" — and must drop non-conforming connections silently rather than with a distinguishing error.
- **Single-use and short-lived:** the listener must reject a second pairing attempt against an already-consumed or expired secret, and must shut down entirely after one successful transfer or on timeout, so a discovered-but-unused listener has a small and shrinking window of relevance.

### A malicious or compromised browser extension on the desktop

**This is the one threat this design cannot mitigate**, and it needs to be said plainly rather than glossed over. The desktop side is a normal browser tab, not a controlled app — any extension with page-content access can read whatever the page renders, including the decrypted credential, once it's on the page. There is no cryptographic fix for this from the phone's side; the desktop browser's own extension permission model is the only boundary, and the user controls that, not this app.

Mitigations that reduce exposure without eliminating the risk:
- Minimize how long decrypted data lives in the page — write it directly into the field the transfer was for (or a copy-to-clipboard action with the existing 30-second auto-clear), not a persistent on-screen display.
- Tear the tab's usable state down immediately after the transfer completes, rather than leaving the decrypted value sitting in page state.
- Say so in the UI: a brief, honest note (e.g., in the consent screen or a first-run explainer) that Web Bridge exposes the transferred item to anything with access to that browser tab's content, including extensions — so a user who doesn't trust their desktop browser's extensions shouldn't use this feature for their most sensitive credentials.

### DNS/mDNS spoofing

Not applicable by construction — the QR encodes a literal IP address, and the flow never performs a DNS lookup or mDNS/Bonjour resolution at any point. There is no hostname anywhere in this design for a spoofed response to target. (This is *why* the design avoids discovery protocols — the alternative of advertising via mDNS and letting the desktop "find" the phone would reopen exactly this threat for no real benefit, since the QR code already carries everything needed.)

## Platform permission asymmetry (worth knowing going in)

- **iOS 14+** has a dedicated "Local Network" runtime permission, separate from general internet access, with its own user-facing prompt (`NSLocalNetworkUsageDescription`). This gives real OS-level scoping and a clear, honest permission prompt: the user is asked specifically for local-network access, matching what the app actually needs.
- **Android** has no equivalent scoped permission — local sockets require the same broad `android.permission.INTERNET` as any WAN request. Android cannot enforce "local network only" at the OS permission level; that constraint is enforced only by this app's own code never making an outbound WAN call, which is a code-review/audit guarantee, not an OS-enforced one. This asymmetry should be documented in `SECURITY.md` once Web Bridge ships, not overclaimed as equivalent to iOS's model.

## Explicitly out of scope for this feature (per the top-level spec)

- Any relay server, cloud component, or NAT traversal, under any circumstance.
- Anything persisting on the desktop side beyond the browser tab's own lifetime (no localStorage, no IndexedDB, no cookies set by the transfer page).
- Defending against a compromised desktop OS or a malicious desktop browser itself (as opposed to a merely-untrusted extension) — that's the same "compromised OS" exclusion already stated in `SECURITY.md` for the rest of the app.

## What was approved

The architecture above in full: phone-as-server, QR-encoded IP + 256-bit pairing secret (same length for the manual-entry fallback), HKDF-derived AES-256-GCM session, no discovery protocol, explicit per-transfer phone-side consent, single-use/short-lived/backgrounding-torn-down sessions.

## Verification scope, stated up front

The pairing-secret generation, QR/manual-entry payload encoding, HKDF session-key derivation, message encryption, and the session state machine (timeout, single-use, consent, teardown) are ordinary TypeScript logic and are unit-tested the same way as the rest of the app. The actual local HTTP/WebSocket listener is a native networking concern that (a) needs a native TCP/WebSocket server module RN doesn't provide out of the box, and (b) can only be genuinely verified with two real devices on a real LAN, which isn't available in this environment — the same constraint that has left the native Android build itself unverified since Phase 1. That piece is deferred and flagged explicitly rather than claimed as done; see `src/webbridge/` for exactly where the line falls.
