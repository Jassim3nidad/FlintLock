import { Buffer } from 'buffer';
import { DecryptionError } from '../../crypto/types';
import { configureTestPlatform, resetPlatformForTests } from '../../testing/configureTestPlatform';
import { decodeFlbx, encodeFlbx, FLBX_FORMAT_VERSION, FLBX_MAGIC, FlbxFormatError } from '../flbxFormat';

beforeEach(() => configureTestPlatform());
afterEach(() => resetPlatformForTests());

const FAST_KDF = { kdf: 'pbkdf2' as const, iterations: 100, digest: 'sha256' as const };
const PASSWORD = Buffer.from('correct horse battery staple');
const PAYLOAD = JSON.stringify({ hello: 'world', records: [1, 2, 3] });

describe('encodeFlbx / decodeFlbx — round trip', () => {
  it('decodes back to the exact original payload with the correct password', async () => {
    const file = await encodeFlbx(PASSWORD, PAYLOAD, FAST_KDF);
    const decoded = await decodeFlbx(PASSWORD, file);
    expect(decoded).toBe(PAYLOAD);
  });

  it('starts with the magic header and version byte', async () => {
    const file = await encodeFlbx(PASSWORD, PAYLOAD, FAST_KDF);
    expect(Buffer.from(file.subarray(0, 4)).equals(FLBX_MAGIC)).toBe(true);
    expect(file[4]).toBe(FLBX_FORMAT_VERSION);
  });

  it('the header (kdf + salt) is readable as plaintext JSON without decrypting', async () => {
    const file = await encodeFlbx(PASSWORD, PAYLOAD, FAST_KDF);
    const headerLength = file.readUInt32BE(5);
    const header = JSON.parse(Buffer.from(file.subarray(9, 9 + headerLength)).toString('utf8'));
    expect(header.kdf).toEqual(FAST_KDF);
    expect(typeof header.salt).toBe('string');
  });
});

describe('decodeFlbx — wrong password', () => {
  it('fails closed with DecryptionError, not silently returning garbage', async () => {
    const file = await encodeFlbx(PASSWORD, PAYLOAD, FAST_KDF);
    await expect(decodeFlbx(Buffer.from('wrong password'), file)).rejects.toThrow(DecryptionError);
  });
});

describe('decodeFlbx — structural corruption, caught before any crypto runs', () => {
  it('rejects an empty file', async () => {
    await expect(decodeFlbx(PASSWORD, Buffer.alloc(0))).rejects.toThrow(FlbxFormatError);
  });

  it('rejects a file shorter than the fixed prefix', async () => {
    await expect(decodeFlbx(PASSWORD, Buffer.alloc(5))).rejects.toThrow(/too short/i);
  });

  it('rejects a file with the wrong magic', async () => {
    const file = await encodeFlbx(PASSWORD, PAYLOAD, FAST_KDF);
    const corrupted = Buffer.from(file);
    Buffer.from('XXXX', 'ascii').copy(corrupted, 0);
    await expect(decodeFlbx(PASSWORD, corrupted)).rejects.toThrow(/magic/i);
  });

  it('rejects an unsupported format version', async () => {
    const file = await encodeFlbx(PASSWORD, PAYLOAD, FAST_KDF);
    const corrupted = Buffer.from(file);
    corrupted[4] = 99;
    await expect(decodeFlbx(PASSWORD, corrupted)).rejects.toThrow(/version/i);
  });

  it('rejects a corrupt (non-JSON) header', async () => {
    const file = await encodeFlbx(PASSWORD, PAYLOAD, FAST_KDF);
    const headerLength = file.readUInt32BE(5);
    const corrupted = Buffer.from(file);
    corrupted.fill(0xff, 9, 9 + Math.min(headerLength, 10)); // scramble part of the header JSON
    await expect(decodeFlbx(PASSWORD, corrupted)).rejects.toThrow(FlbxFormatError);
  });
});

describe('decodeFlbx — truncation, per the "fails cleanly" gate criterion', () => {
  it('rejects a file truncated mid-header', async () => {
    const file = await encodeFlbx(PASSWORD, PAYLOAD, FAST_KDF);
    const truncated = Buffer.from(file.subarray(0, 10)); // cuts off inside the header JSON
    await expect(decodeFlbx(PASSWORD, truncated)).rejects.toThrow(FlbxFormatError);
  });

  it('rejects a file truncated right after the header, missing the whole envelope', async () => {
    const file = await encodeFlbx(PASSWORD, PAYLOAD, FAST_KDF);
    const headerLength = file.readUInt32BE(5);
    const headerEnd = 9 + headerLength;
    const truncated = Buffer.from(file.subarray(0, headerEnd));
    await expect(decodeFlbx(PASSWORD, truncated)).rejects.toThrow(/truncated/i);
  });

  it('rejects a file truncated mid-ciphertext (structurally long enough, but GCM catches it)', async () => {
    const file = await encodeFlbx(PASSWORD, PAYLOAD, FAST_KDF);
    const truncated = Buffer.from(file.subarray(0, file.length - 5)); // still clears the structural minimum
    await expect(decodeFlbx(PASSWORD, truncated)).rejects.toThrow(DecryptionError);
  });

  it('rejects a file with extra garbage appended (GCM tag no longer matches)', async () => {
    const file = await encodeFlbx(PASSWORD, PAYLOAD, FAST_KDF);
    const extended = Buffer.concat([file, Buffer.from('trailing garbage')]);
    await expect(decodeFlbx(PASSWORD, extended)).rejects.toThrow(DecryptionError);
  });

  it('never returns a value on any of the above — throw or nothing, never partial data', async () => {
    const file = await encodeFlbx(PASSWORD, PAYLOAD, FAST_KDF);
    const cases = [Buffer.alloc(0), Buffer.from(file.subarray(0, 10)), Buffer.from(file.subarray(0, file.length - 1))];
    for (const c of cases) {
      await expect(decodeFlbx(PASSWORD, c)).rejects.toBeInstanceOf(Error);
    }
  });
});

describe('decodeFlbx — bit-flip tamper detection', () => {
  it('rejects a single flipped ciphertext byte', async () => {
    const file = await encodeFlbx(PASSWORD, PAYLOAD, FAST_KDF);
    const tampered = Buffer.from(file);
    tampered[tampered.length - 1]! ^= 0xff; // eslint-disable-line no-bitwise -- flip the last ciphertext byte
    await expect(decodeFlbx(PASSWORD, tampered)).rejects.toThrow(DecryptionError);
  });

  it('rejects a single flipped auth-tag byte', async () => {
    const file = await encodeFlbx(PASSWORD, PAYLOAD, FAST_KDF);
    const headerLength = file.readUInt32BE(5);
    const tagStart = 9 + headerLength + 12; // header end + IV length
    const tampered = Buffer.from(file);
    tampered[tagStart]! ^= 0xff; // eslint-disable-line no-bitwise -- flip the first auth-tag byte
    await expect(decodeFlbx(PASSWORD, tampered)).rejects.toThrow(DecryptionError);
  });
});
