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
 * The master password used for the on-device export that produced the
 * fixture above — supplied alongside the pulled file, not invented here.
 */
export const DEVICE_EXPORT_PASSWORD: string | null = null;

/**
 * What the on-device credential + TOTP entry should contain, matched by
 * content via toMatchObject() rather than by id/timestamps (those are
 * generated at creation time and can't be predicted ahead of the
 * device pass). Update this to whatever was actually entered on-device
 * if it ends up differing from the checklist's prescribed values.
 */
export const DEVICE_EXPORT_EXPECTED_CREDENTIAL = {
  title: 'Device Crosscheck',
  username: 'device-crosscheck',
  password: 'DeviceCrosscheck-Pw1!',
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
