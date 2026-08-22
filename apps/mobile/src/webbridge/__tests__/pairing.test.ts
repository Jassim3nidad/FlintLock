jest.mock('../../crypto/native');
jest.mock('../../storage/native');
jest.mock('../../biometric/native');
jest.mock('../../clipboard/native');

import { resetPlatformForTests } from '@flintlock/core';
import {
  decodeQrPayload,
  encodeQrPayload,
  formatSecretForManualEntry,
  generatePairingSecret,
  parseManualEntrySecret,
  QrPayload,
} from '../pairing';
import { configureNativeTestPlatform } from '../../testUtils/configureNativePlatform';

beforeEach(() => configureNativeTestPlatform());
afterEach(() => resetPlatformForTests());

describe('generatePairingSecret', () => {
  it('is 256 bits and differs across calls', () => {
    const a = generatePairingSecret();
    const b = generatePairingSecret();
    expect(a.length).toBe(32);
    expect(a.equals(b)).toBe(false);
  });
});

describe('formatSecretForManualEntry / parseManualEntrySecret', () => {
  it('round-trips a generated secret', () => {
    const secret = generatePairingSecret();
    const formatted = formatSecretForManualEntry(secret);
    expect(parseManualEntrySecret(formatted).equals(secret)).toBe(true);
  });

  it('formats in hyphen-separated groups of 4', () => {
    const secret = generatePairingSecret();
    const formatted = formatSecretForManualEntry(secret);
    expect(formatted).toMatch(/^[A-Z2-7]{1,4}(-[A-Z2-7]{1,4})*$/);
  });

  it('tolerates lowercase and extra whitespace when parsing', () => {
    const secret = generatePairingSecret();
    const formatted = formatSecretForManualEntry(secret);
    const messy = formatted.toLowerCase().replace(/-/g, ' - ');
    expect(parseManualEntrySecret(messy).equals(secret)).toBe(true);
  });

  it('rejects text that decodes to the wrong length', () => {
    expect(() => parseManualEntrySecret('AAAA')).toThrow(/length/i);
  });
});

describe('encodeQrPayload / decodeQrPayload', () => {
  const payload: QrPayload = {
    ip: '192.168.1.42',
    port: 8443,
    secret: 'c29tZS1zZWNyZXQ',
    sessionId: 'session-abc-123',
    expiresAt: 1_700_000_000_000,
  };

  it('round-trips a payload exactly', () => {
    const encoded = encodeQrPayload(payload);
    expect(decodeQrPayload(encoded)).toEqual(payload);
  });

  it('rejects non-matching text', () => {
    expect(() => decodeQrPayload('https://example.com')).toThrow(/not a valid/i);
  });

  it('rejects an invalid port', () => {
    const bad = encodeQrPayload(payload).replace(':8443/', ':99999999/');
    expect(() => decodeQrPayload(bad)).toThrow(/port/i);
  });

  it('rejects a payload missing the secret parameter', () => {
    const bad = `flintlock-bridge://192.168.1.42:8443/session-abc-123?expiresAt=1700000000000`;
    expect(() => decodeQrPayload(bad)).toThrow(/secret/i);
  });

  it('rejects a payload missing expiresAt', () => {
    const bad = `flintlock-bridge://192.168.1.42:8443/session-abc-123?secret=abc`;
    expect(() => decodeQrPayload(bad)).toThrow(/expiresAt/i);
  });
});
