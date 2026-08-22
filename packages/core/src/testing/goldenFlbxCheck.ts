import { Buffer } from 'buffer';
import { decodeFlbx } from '../export/flbxFormat';
import { GOLDEN_FLBX_BASE64, GOLDEN_FLBX_MASTER_PASSWORD, GOLDEN_FLBX_RECORDS } from './fixtures/goldenFlbx';

/**
 * Call from each app's own test suite, after configuring that app's real
 * platform bindings (not the Node reference provider) — the point is to
 * prove the concrete implementation, not the reference one, can open a
 * file it didn't write. If this goes red on either platform, the .flbx
 * format has forked between mobile and web. This is meant to become the
 * single most important test in the project — see the fixture's own doc
 * comment — but it is NOT that yet, and must not be trusted as one:
 *
 * As of this writing, BOTH registered call sites resolve to Node's
 * `crypto` module under the hood. packages/core's own suite runs it
 * against the Node reference provider directly
 * (testing/nodeCryptoProvider.ts). apps/mobile's suite runs it against
 * nativeCryptoProvider, but only under `jest.mock('.../crypto/native')`
 * — react-native-quick-crypto's real native binding is never invoked in
 * a Jest run, only its Node-crypto-backed test double
 * (crypto/__mocks__/native.ts). So this is one implementation (Node's
 * OpenSSL/BoringSSL via `node:crypto`) checked against itself twice,
 * through two different call paths. It cannot catch a real
 * cross-implementation divergence — a bug specific to WebCrypto, or to
 * quick-crypto's actual native code, would pass this test today.
 *
 * This becomes a real parity check only once:
 *   (a) apps/web's WebCrypto-backed provider is registered here too, and
 *   (b) apps/mobile's result has been verified at least once on a real
 *       device/simulator, exercising react-native-quick-crypto's actual
 *       native binding instead of the Jest mock.
 * Until both of those are true, a green result here means "the format's
 * own bookkeeping — magic bytes, header layout, AAD binding — is
 * internally consistent," not "two independent crypto implementations
 * agree on this file." Don't let that distinction go stale.
 *
 * Status: (b) is staged but not yet complete — see
 * export/__tests__/deviceCrossImplementation.test.ts, which decrypts a
 * real on-device-exported .flbx with the Node reference provider (the
 * reverse of this file's direction) and is currently skipped pending
 * fixture data from the device verification pass in docs/CRYPTO.md.
 * (a) has not started — apps/web does not exist yet.
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
