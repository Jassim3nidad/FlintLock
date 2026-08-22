import { Buffer } from 'buffer';
import { recordAad } from '../cipher';

// AES-GCM round-trip/tamper/IV-uniqueness behavior lives in the shared
// CryptoProvider conformance suite (conformance.test.ts) — it needs to
// run identically against every platform's provider, not just here.
// recordAad is pure core logic with no platform dependency, so it's
// tested directly.
describe('recordAad — unambiguous binding', () => {
  it('is length-prefixed, not delimiter-joined, so it cannot alias across the id/version boundary', () => {
    // A naive `${id}:${version}` join conflates id="a:1", version=2 with
    // id="a", version="1:2" — both render as "a:1:2". Length-prefixing the
    // id up front means the version field's byte offset is fixed and can
    // never be shifted by content inside the id.
    const a = recordAad('a:1', 2);
    const b = recordAad('a', 2); // shorter id, same version — must differ
    expect(a.equals(b)).toBe(false);
    expect(a.length).toBe(8 + 'a:1'.length);
    expect(b.length).toBe(8 + 'a'.length);
  });

  it('is deterministic for the same inputs', () => {
    expect(recordAad('rec-1', 3).equals(recordAad('rec-1', 3))).toBe(true);
  });
});

describe('recordAad — Buffer construction', () => {
  it('produces a Buffer, not a bare ArrayBuffer', () => {
    expect(Buffer.isBuffer(recordAad('x', 1))).toBe(true);
  });
});
