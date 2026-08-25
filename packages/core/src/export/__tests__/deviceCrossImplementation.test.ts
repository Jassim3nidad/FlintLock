import { Buffer } from 'buffer';
import { configureTestPlatform, resetPlatformForTests } from '../../testing/configureTestPlatform';
import {
  DEVICE_EXPORTED_FLBX_BASE64,
  DEVICE_EXPORT_EXPECTED_CREDENTIAL,
  DEVICE_EXPORT_EXPECTED_TOTP,
  DEVICE_EXPORT_PASSWORD,
} from '../../testing/fixtures/deviceFlbx';
import { decodeFlbx } from '../flbxFormat';
import { Credential, TotpEntry, VaultRecord } from '../../storage/schema';

/**
 * The first genuine cross-implementation check in this project: decrypts
 * a .flbx file actually produced by react-native-quick-crypto's real
 * native binding, using packages/core's Node-`crypto`-backed reference
 * provider — two independently-implemented AES-256-GCM/PBKDF2 stacks,
 * not one implementation checked against itself (see
 * cryptoProviderConformance.ts's and goldenFlbxCheck.ts's doc comments
 * for why that distinction matters and why neither of those currently
 * meets it).
 *
 * HOW TO PRODUCE THE FIXTURE THIS TEST NEEDS (do this during the device
 * verification pass, see docs/CRYPTO.md):
 *
 *   1. On the device, add exactly one credential and one attached TOTP
 *      entry matching DEVICE_EXPORT_EXPECTED_CREDENTIAL /
 *      DEVICE_EXPORT_EXPECTED_TOTP in ../../testing/fixtures/deviceFlbx.ts
 *      (or enter different values and update that fixture file to match
 *      what you actually typed — content is what's asserted, not
 *      specific IDs, which are generated at creation time).
 *   2. Set the vault's master password to DEVICE_EXPORT_PASSWORD
 *      (../../testing/fixtures/deviceFlbx.ts) when you create it —
 *      pinned in advance rather than chosen freely and reported back,
 *      so a mistyped password can't be confused with a real
 *      cross-implementation crypto mismatch. Settings → Export vault →
 *      format .flbx → enter that exact password → Export.
 *   3. Locate the exported file (the share sheet's destination) and
 *      pull it: `adb pull <path-on-device> device-export.flbx`, or
 *      share it to somewhere you can retrieve the base64-encoded
 *      content the app produced.
 *   4. Base64-encode it if it isn't already (`base64 -w0 device-export.flbx`
 *      or equivalent) and paste the result into
 *      DEVICE_EXPORTED_FLBX_BASE64 in ../../testing/fixtures/deviceFlbx.ts.
 *   5. Run this test. It stops being skipped automatically once that
 *      fixture value is non-null.
 */
// DEVICE_EXPORT_PASSWORD is pinned in advance (see deviceFlbx.ts) — only
// the exported file itself is still pending.
const canRun = DEVICE_EXPORTED_FLBX_BASE64 !== null;
const maybeDescribe = canRun ? describe : describe.skip;

if (!canRun) {
  // eslint-disable-next-line no-console -- deliberately visible in CI/local runs so this isn't mistaken for silent success
  console.warn(
    '[deviceCrossImplementation.test.ts] Skipped — DEVICE_EXPORTED_FLBX_BASE64 not yet populated. ' +
      'This is the only test in the project that checks a real react-native-quick-crypto artifact against an independent ' +
      'implementation; see this file\'s own header comment for how to produce it during the device verification pass.'
  );
}

beforeEach(() => configureTestPlatform());
afterEach(() => resetPlatformForTests());

maybeDescribe('Cross-implementation check: device-exported .flbx decrypted by the Node reference provider', () => {
  it('decrypts a real react-native-quick-crypto artifact to the expected record content', async () => {
    const file = Buffer.from(DEVICE_EXPORTED_FLBX_BASE64!, 'base64');
    const json = await decodeFlbx(Buffer.from(DEVICE_EXPORT_PASSWORD, 'utf8'), file);
    const payload = JSON.parse(json) as { records: VaultRecord[] };

    const credential = payload.records.find((r): r is Credential => r.recordType === 'credential');
    const totp = payload.records.find((r): r is TotpEntry => r.recordType === 'totp');

    expect(credential).toMatchObject(DEVICE_EXPORT_EXPECTED_CREDENTIAL);
    expect(totp).toMatchObject(DEVICE_EXPORT_EXPECTED_TOTP);

    // Explicit, redundant with the toMatchObject above on purpose: this
    // compares the raw decrypted base32 secret bytes directly against
    // the known plaintext, never a *generated* TOTP code. Asserting on
    // a generated code would make this test depend on both the device
    // and this test run computing the code from the same timestamp —
    // flaky by construction, and it wouldn't be testing anything the
    // secret-bytes comparison doesn't already cover.
    expect(totp!.secret).toBe(DEVICE_EXPORT_EXPECTED_TOTP.secret);
  });
});
