/**
 * PBKDF2-HMAC-SHA-256 known-answer vectors from RFC 7914 §11
 * (https://www.rfc-editor.org/rfc/rfc7914.txt), extracted programmatically
 * from the raw fetched RFC text (not hand-transcribed, and not taken from
 * WebFetch's summarized output — that tool runs content through a small
 * model before returning it, which is not safe for verbatim hex; an
 * earlier hand-copy from that summary had a transcription error this file
 * replaces). Cross-checked against a live crypto.pbkdf2Sync computation.
 *
 * The RFC vectors are dkLen=64; PBKDF2 output is prefix-stable (block N
 * only depends on blocks < N), so truncating to our dkLen=32 is valid —
 * truncate32() below does exactly that instead of re-typing new hex.
 */

const truncate32 = (hex64Bytes: string): string => hex64Bytes.slice(0, 64);

export const PBKDF2_SHA256_VECTORS = [
  {
    name: 'RFC 7914 §11, vector 1 (c=1)',
    password: 'passwd',
    salt: 'salt',
    iterations: 1,
    expectedHex: truncate32(
      '55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc49ca9cccf179b645991664b39d77ef317c71b845b1e30bd509112041d3a19783'
    ),
  },
  {
    name: 'RFC 7914 §11, vector 2 (c=80000)',
    password: 'Password',
    salt: 'NaCl',
    iterations: 80000,
    expectedHex: truncate32(
      '4ddcd8f60b98be21830cee5ef22701f9641a4418d04c0414aeff08876b34ab56a1d425a1225833549adb841b51c9b3176a272bdebba1d078478f62b397f33c8d'
    ),
  },
];
