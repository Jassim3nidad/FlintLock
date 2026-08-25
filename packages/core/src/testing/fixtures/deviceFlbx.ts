/**
 * A .flbx file actually produced by react-native-quick-crypto's real
 * native binding on a physical device — as opposed to every other
 * fixture in this project, which was produced by Node's `crypto` (the
 * reference provider directly, or through the Jest mock that stands in
 * for the native binding in every test run). Decrypting this file with
 * the Node reference provider in deviceCrossImplementation.test.ts is
 * the first genuine cross-implementation check the project has had.
 *
 * Populated once, by hand, after the device verification pass — see
 * docs/CRYPTO.md's device verification checklist and this fixture's
 * sibling test file for exactly what to produce on-device and how to
 * get it here. Until DEVICE_EXPORTED_FLBX_BASE64 is set, the test that
 * consumes it is skipped rather than failing the build.
 */
export const DEVICE_EXPORTED_FLBX_BASE64: string | null = null;

/**
 * The master password for the device-pass test vault, pinned here in
 * advance rather than chosen freely and reported back — a typo in a
 * password that's only ever spoken, never written down, would be
 * indistinguishable from a real cross-implementation crypto mismatch,
 * which is exactly the failure mode this whole test exists to catch.
 * Set up the walkthrough vault (docs/CRYPTO.md's device checklist,
 * step 1) with this exact master password, and use it again verbatim
 * for the step 7 .flbx export.
 */
export const DEVICE_EXPORT_PASSWORD = 'device-crosscheck-Pw1!';

/**
 * What the on-device credential + TOTP entry should contain, matched by
 * content via toMatchObject() rather than by id/timestamps (those are
 * generated at creation time and can't be predicted ahead of the
 * device pass). Update this to whatever was actually entered on-device
 * if it ends up differing from the checklist's prescribed values.
 */
// Deliberately not a near-miss of DEVICE_EXPORT_PASSWORD above (e.g. a
// same-string-different-casing variant) — the two are visually distinct
// on purpose, since a transcription slip between "the vault's master
// password" and "this credential's stored password" is exactly the
// kind of typo this whole exercise is trying to keep out of the loop.
export const DEVICE_EXPORT_EXPECTED_CREDENTIAL = {
  title: 'Device Crosscheck',
  username: 'device-crosscheck',
  password: 'StoredCredentialValue789#',
  urls: ['https://example.com/device-crosscheck'],
};

export const DEVICE_EXPORT_EXPECTED_TOTP = {
  issuer: 'Device Crosscheck',
  account: 'device-crosscheck',
  secret: 'JBSWY3DPEHPK3PXP', // pragma: allowlist secret -- well-known RFC-tutorial TOTP example secret, prescribed by docs/CRYPTO.md's device checklist, not a real one
  algorithm: 'SHA1' as const,
  digits: 6 as const,
  mode: 'totp' as const,
  period: 30,
};
