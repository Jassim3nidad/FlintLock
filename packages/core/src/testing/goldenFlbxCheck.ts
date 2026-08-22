import { Buffer } from 'buffer';
import { decodeFlbx } from '../export/flbxFormat';
import { GOLDEN_FLBX_BASE64, GOLDEN_FLBX_MASTER_PASSWORD, GOLDEN_FLBX_RECORDS } from './fixtures/goldenFlbx';

/**
 * Call from each app's own test suite, after configuring that app's real
 * platform bindings (not the Node reference provider) — the point is to
 * prove the concrete implementation, not the reference one, can open a
 * file it didn't write. If this goes red on either platform, the .flbx
 * format has forked between mobile and web. This is the single most
 * important test in the project — see the fixture's own doc comment.
 */
export function describeGoldenFlbxCheck(platformName: string): void {
  describe(`Golden .flbx fixture: ${platformName}`, () => {
    it('decrypts to the exact byte-identical record set fixed at fixture-generation time', async () => {
      const file = Buffer.from(GOLDEN_FLBX_BASE64, 'base64');
      const json = await decodeFlbx(Buffer.from(GOLDEN_FLBX_MASTER_PASSWORD, 'utf8'), file);
      const payload = JSON.parse(json) as { records: unknown };
      expect(payload.records).toEqual(GOLDEN_FLBX_RECORDS);
    });
  });
}
