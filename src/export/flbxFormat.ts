import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  Buffer,
  deriveKek,
  generateSalt,
  GCM_AUTH_TAG_LENGTH_BYTES,
  GCM_IV_LENGTH_BYTES,
  KdfParams,
} from '../crypto';

/**
 * .flbx binary layout — see docs/FLBX_FORMAT.md for the full spec.
 *
 *   [4 bytes]  magic "FLBX"
 *   [1 byte]   format version
 *   [4 bytes]  header length, big-endian uint32
 *   [N bytes]  header JSON (plaintext: kdf params + salt)
 *   [12 bytes] GCM IV
 *   [16 bytes] GCM auth tag
 *   [rest]     ciphertext
 */
export const FLBX_MAGIC = Buffer.from('FLBX', 'ascii');
export const FLBX_FORMAT_VERSION = 1;

export class FlbxFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FlbxFormatError';
  }
}

interface FlbxHeader {
  kdf: KdfParams;
  /** Base64. */
  salt: string;
}

/** Binds the ciphertext to the format identity — a payload from a different magic/version can't be presented as this one. */
function flbxAad(): Buffer {
  return Buffer.concat([FLBX_MAGIC, Buffer.from([FLBX_FORMAT_VERSION])]);
}

/**
 * Encrypts `payloadJson` under a key derived fresh from `masterPassword`
 * for this export alone — deliberately not the vault's own DEK or KEK,
 * so a .flbx file's exposure never has any bearing on the live vault's
 * key material, and vice versa.
 */
export async function encodeFlbx(masterPassword: Buffer, payloadJson: string, kdfParams: KdfParams): Promise<Buffer> {
  const salt = generateSalt();
  const key = await deriveKek(masterPassword, kdfParams, salt);

  let envelope;
  try {
    envelope = aesGcmEncrypt(Buffer.from(payloadJson, 'utf8'), key, flbxAad());
  } finally {
    key.fill(0);
  }

  const header: FlbxHeader = { kdf: kdfParams, salt: salt.toString('base64') };
  const headerBytes = Buffer.from(JSON.stringify(header), 'utf8');
  const headerLength = Buffer.alloc(4);
  headerLength.writeUInt32BE(headerBytes.length, 0);

  return Buffer.concat([
    FLBX_MAGIC,
    Buffer.from([FLBX_FORMAT_VERSION]),
    headerLength,
    headerBytes,
    envelope.iv,
    envelope.authTag,
    envelope.ciphertext,
  ]);
}

const FIXED_PREFIX_LENGTH = FLBX_MAGIC.length + 1 + 4; // magic + version + headerLength

/**
 * Decrypts and returns the payload JSON. Throws FlbxFormatError for
 * structural problems (too short, bad magic, unsupported version,
 * corrupt header) detected before any crypto runs, and DecryptionError
 * (from src/crypto) for anything the GCM auth tag catches — wrong
 * password, a tampered ciphertext, or a ciphertext truncated past the
 * structural minimum. Either way: never returns partial data:  the
 * caller only ever gets a value from this function after every check
 * has fully passed.
 */
export async function decodeFlbx(masterPassword: Buffer, file: Buffer): Promise<string> {
  if (file.length < FIXED_PREFIX_LENGTH) {
    throw new FlbxFormatError('File is too short to be a valid .flbx file (truncated)');
  }
  if (!file.subarray(0, FLBX_MAGIC.length).equals(FLBX_MAGIC)) {
    throw new FlbxFormatError('Not a .flbx file (missing magic header)');
  }

  const version = file[FLBX_MAGIC.length]!;
  if (version !== FLBX_FORMAT_VERSION) {
    throw new FlbxFormatError(`Unsupported .flbx format version: ${version}`);
  }

  const headerLenOffset = FLBX_MAGIC.length + 1;
  const headerLength = file.readUInt32BE(headerLenOffset);
  const headerStart = headerLenOffset + 4;
  const headerEnd = headerStart + headerLength;
  const envelopeMinEnd = headerEnd + GCM_IV_LENGTH_BYTES + GCM_AUTH_TAG_LENGTH_BYTES;

  if (file.length < envelopeMinEnd) {
    throw new FlbxFormatError('File is too short to contain its declared header and envelope (truncated)');
  }

  let header: FlbxHeader;
  try {
    header = JSON.parse(file.subarray(headerStart, headerEnd).toString('utf8')) as FlbxHeader;
  } catch {
    throw new FlbxFormatError('Corrupt .flbx header (not valid JSON)');
  }
  if (typeof header.salt !== 'string' || typeof header.kdf !== 'object' || header.kdf === null) {
    throw new FlbxFormatError('Corrupt .flbx header (missing kdf or salt)');
  }

  const ivStart = headerEnd;
  const tagStart = ivStart + GCM_IV_LENGTH_BYTES;
  const ciphertextStart = tagStart + GCM_AUTH_TAG_LENGTH_BYTES;
  const iv = file.subarray(ivStart, tagStart);
  const authTag = file.subarray(tagStart, ciphertextStart);
  const ciphertext = file.subarray(ciphertextStart);

  const salt = Buffer.from(header.salt, 'base64');
  const key = await deriveKek(masterPassword, header.kdf, salt);
  try {
    const plaintext = aesGcmDecrypt({ iv, authTag, ciphertext }, key, flbxAad());
    return plaintext.toString('utf8');
  } finally {
    key.fill(0);
  }
}
