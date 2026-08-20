# .flbx format (version 1)

Flintlock's native encrypted export format. Implementation: [`src/export/flbxFormat.ts`](../src/export/flbxFormat.ts) (binary encode/decode) and [`src/export/flbxService.ts`](../src/export/flbxService.ts) (payload shape, export, preview/commit import).

## Design goals

- **Self-contained and independently keyed.** A .flbx file must be openable on its own, without the vault it came from — it carries its own KDF params and salt, and is encrypted under a key derived fresh from the master password *for that export alone*. It never reuses the live vault's DEK or KEK: losing a .flbx file (or the live vault) never has any bearing on the other's key material.
- **Whole-payload authentication.** The entire records payload is one AES-256-GCM ciphertext with one auth tag — not per-record encryption. A single tag covers everything, so there's no way for part of the file to decrypt successfully while another part is silently corrupted.
- **Fail clean, never partial.** Every structural check (length, magic, version, header shape) happens before any cryptographic operation. A truncated or tampered file always throws a clear, typed error — `FlbxFormatError` for structural problems, `DecryptionError` (from `src/crypto`) for anything the GCM tag catches — and the caller never receives a partially-decoded result.
- **Versioned and forward-readable.** The magic header and format version are plaintext and read first, before anything else, so a future format version can still recognize and reject (or migrate) an older file without guessing.

## Binary layout

```
┌─────────────┬──────────┬───────────────────┬─────────────────┬──────────┬──────────┬─────────────┐
│ magic "FLBX"│ version  │ header length (BE) │ header (JSON)    │ GCM IV   │ auth tag │ ciphertext  │
│ 4 bytes     │ 1 byte   │ 4 bytes (uint32)   │ N bytes          │ 12 bytes │ 16 bytes │ rest        │
└─────────────┴──────────┴───────────────────┴─────────────────┴──────────┴──────────┴─────────────┘
```

All plaintext fields (magic, version, header length, header) are read before any key derivation or decryption is attempted.

### Header (plaintext JSON)

```json
{
  "kdf": { "kdf": "pbkdf2", "iterations": 310000, "digest": "sha256" },
  "salt": "base64-encoded-32-byte-salt"
}
```

Same `KdfParams` shape as the vault header (`src/crypto/types.ts`), so a future format version that adds a new KDF algorithm only needs to teach the decoder that shape — the binary framing around it doesn't change.

### AAD

The GCM additional authenticated data is `magic || version` (5 bytes) — binds the ciphertext to this exact format identity, so a payload can't be re-presented as a different magic/version pair even if somehow re-framed.

### Payload (after decryption, UTF-8 JSON)

```ts
interface FlbxPayload {
  exportedAt: number;       // Unix ms
  sourceVaultId: string;    // the exporting vault's id, for traceability — not used for anything security-relevant
  records: VaultRecord[];   // every credential, TOTP entry, and tag — full fidelity
}
```

## Key derivation

`deriveKek(masterPassword, header.kdf, salt)` — the exact same primitive the vault itself uses (`src/crypto/kdf.ts`), just called with parameters scoped to this one export. Export always uses fresh, randomly generated 32-byte salt (`generateSalt()`), independent of the vault's own salt.

## Export

Requires the master password, re-verified by the UI layer immediately before export is triggered (that re-verification is a UI-flow concern; `exportFlbx()` itself doesn't re-check the password against the vault — it only uses it to derive the fresh export key). Produces one `.flbx` file containing every non-deleted *and* soft-deleted-but-not-yet-purged record currently in the vault, in full — this is a backup format, not a filtered view.

## Import

Two-step, matching the spec's requirement for a preview before committing:

1. **`previewFlbxImport(session, masterPassword, fileBytes)`** — decrypts and validates the file (throwing on any structural or cryptographic failure), then classifies every record in it against what's already in the vault: `add` (new id), `update` (existing id, different content), or `unchanged` (existing id, identical content). Nothing is written yet.
2. **`commitFlbxImport(session, preview, mode)`** — applies the previously-computed preview.
   - `merge`: writes every `add`/`update` record; skips `unchanged` ones. Importing the same file twice in a row is a no-op the second time.
   - `replace`: deletes every record currently in the vault first, then writes the imported set — the file becomes the vault's complete contents.

## What's deliberately out of scope for v1

- Migrating an older `.flbx` format version forward. Not needed yet — there's only one version. When a v2 is needed, the version byte lets the decoder recognize v1 files and route them through a migration path without breaking.
- Partial/selective export (exporting only some records). Export is always the full vault; filtering is a UI-layer concern if it's ever added.
