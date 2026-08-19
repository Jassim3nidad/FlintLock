import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  Buffer,
  dekWrapAad,
  deriveKek,
  generateDek,
  generateSalt,
  KdfParams,
  Pbkdf2Params,
  PBKDF2_DEFAULT_ITERATIONS,
  recordAad,
  unwrapDek,
  wrapDek,
  WrappedKey,
} from '../crypto';
import { randomUUID } from '../crypto/csprng';
import { vaultStorage } from './native';
import { packEnvelope, unpackEnvelope } from './serialization';
import {
  DEFAULT_VAULT_SETTINGS,
  SCHEMA_VERSION,
  VAULT_FORMAT_VERSION,
  VaultHeader,
  VaultRecord,
} from './schema';

const HEADER_KEY = 'vault:header';
const INDEX_KEY = 'vault:index';
const recordKey = (id: string): string => `vault:record:${id}`;

export const DEFAULT_PBKDF2_PARAMS: Pbkdf2Params = {
  kdf: 'pbkdf2',
  iterations: PBKDF2_DEFAULT_ITERATIONS,
  digest: 'sha256',
};

interface IndexEntry {
  id: string;
  recordType: VaultRecord['recordType'];
}

function readHeader(): VaultHeader | undefined {
  const raw = vaultStorage.getString(HEADER_KEY);
  return raw ? (JSON.parse(raw) as VaultHeader) : undefined;
}

function writeHeader(header: VaultHeader): void {
  vaultStorage.set(HEADER_KEY, JSON.stringify(header));
}

function readIndex(): IndexEntry[] {
  const raw = vaultStorage.getString(INDEX_KEY);
  return raw ? (JSON.parse(raw) as IndexEntry[]) : [];
}

function writeIndex(entries: IndexEntry[]): void {
  vaultStorage.set(INDEX_KEY, JSON.stringify(entries));
}

/**
 * Owns one vault's persisted state: the plaintext header (KDF params,
 * salt, wrapped DEK) and per-record encrypted storage. See
 * docs/CRYPTO.md for the key hierarchy this implements.
 *
 * Search/listing here is decrypt-on-demand: `listIndex()` returns only
 * non-sensitive {id, recordType} pairs from a plaintext index, and every
 * actual field (title, username, password, ...) requires decrypting that
 * specific record via `getRecord()`. No separate encrypted search index
 * is maintained.
 *
 * Why decrypt-on-demand over a search index: an index needs its own
 * sync-on-every-write discipline and, if it's to support substring
 * search, either stores enough plaintext to be useful (defeating the
 * point) or needs a blind-index/tokenization scheme with its own key
 * material and false-positive tuning. For a vault sized like a personal
 * password manager (tens to low thousands of records), decrypting every
 * record once during a search is sub-second on-device with a native
 * AES-GCM binding, and a small bounded LRU cache (added when the search
 * UI lands in Phase 4) amortizes repeat lookups. Revisit only if real
 * vault sizes make cold full-vault search noticeably slow.
 */
export class VaultStore {
  private header: VaultHeader;
  private dek: Buffer | null;

  private constructor(header: VaultHeader, dek: Buffer) {
    this.header = header;
    this.dek = dek;
  }

  static exists(): boolean {
    return vaultStorage.contains(HEADER_KEY);
  }

  /** Creates a brand-new, empty vault. Throws if one already exists on this device. */
  static async create(
    masterPassword: Buffer,
    kdfParams: KdfParams = DEFAULT_PBKDF2_PARAMS
  ): Promise<VaultStore> {
    if (VaultStore.exists()) {
      throw new Error('A vault already exists on this device');
    }

    const vaultId = randomUUID();
    const salt = generateSalt();
    const dek = generateDek();
    const kdfParamsVersion = 1;

    const kek = await deriveKek(masterPassword, kdfParams, salt);
    let wrapped: WrappedKey;
    try {
      wrapped = wrapDek(dek, kek, dekWrapAad(vaultId, kdfParamsVersion));
    } finally {
      kek.fill(0);
    }

    const now = Date.now();
    const header: VaultHeader = {
      formatVersion: VAULT_FORMAT_VERSION,
      vaultId,
      kdf: kdfParams,
      kdfParamsVersion,
      salt: salt.toString('base64'),
      wrappedDek: {
        iv: wrapped.iv.toString('base64'),
        ciphertext: wrapped.ciphertext.toString('base64'),
        authTag: wrapped.authTag.toString('base64'),
      },
      createdAt: now,
      modifiedAt: now,
      settings: DEFAULT_VAULT_SETTINGS,
    };
    writeHeader(header);
    writeIndex([]);

    return new VaultStore(header, dek);
  }

  /**
   * Opens the existing on-device vault. This IS master-password
   * verification (see docs/CRYPTO.md) — a wrong password throws
   * DecryptionError from the DEK-unwrap step, with no separate check.
   */
  static async open(masterPassword: Buffer): Promise<VaultStore> {
    const header = readHeader();
    if (!header) {
      throw new Error('No vault exists on this device');
    }

    const salt = Buffer.from(header.salt, 'base64');
    const kek = await deriveKek(masterPassword, header.kdf, salt);
    const wrapped: WrappedKey = {
      iv: Buffer.from(header.wrappedDek.iv, 'base64'),
      ciphertext: Buffer.from(header.wrappedDek.ciphertext, 'base64'),
      authTag: Buffer.from(header.wrappedDek.authTag, 'base64'),
    };

    let dek: Buffer;
    try {
      dek = unwrapDek(wrapped, kek, dekWrapAad(header.vaultId, header.kdfParamsVersion));
    } finally {
      kek.fill(0);
    }

    return new VaultStore(header, dek);
  }

  /** Wipes the DEK from memory. All record access throws until re-opened. */
  lock(): void {
    if (this.dek) {
      this.dek.fill(0);
      this.dek = null;
    }
  }

  isUnlocked(): boolean {
    return this.dek !== null;
  }

  private requireDek(): Buffer {
    if (!this.dek) throw new Error('Vault is locked');
    return this.dek;
  }

  /** Non-sensitive {id, recordType} pairs for every record — safe to read without decrypting. */
  listIndex(): IndexEntry[] {
    return readIndex();
  }

  /** Encrypts and persists `record`, creating or overwriting by `record.id`. */
  putRecord(record: VaultRecord): void {
    const dek = this.requireDek();
    const plaintext = Buffer.from(JSON.stringify(record), 'utf8');
    const envelope = aesGcmEncrypt(plaintext, dek, recordAad(record.id, SCHEMA_VERSION));
    vaultStorage.set(recordKey(record.id), packEnvelope(envelope));

    const index = readIndex();
    const existing = index.findIndex((e) => e.id === record.id);
    const entry: IndexEntry = { id: record.id, recordType: record.recordType };
    if (existing === -1) index.push(entry);
    else index[existing] = entry;
    writeIndex(index);

    this.touchModified();
  }

  /**
   * Decrypts and returns the record with `id`, or undefined if it doesn't
   * exist. Throws DecryptionError — never returns partial data — if the
   * stored bytes are corrupted or tampered with.
   */
  getRecord(id: string): VaultRecord | undefined {
    const dek = this.requireDek();
    const packed = vaultStorage.getBuffer(recordKey(id));
    if (!packed) return undefined;

    const envelope = unpackEnvelope(packed);
    const plaintext = aesGcmDecrypt(envelope, dek, recordAad(id, SCHEMA_VERSION));
    return JSON.parse(plaintext.toString('utf8')) as VaultRecord;
  }

  /** Hard-deletes the record with `id`. Soft-delete (trash) is a field on the record itself, not a storage concern. */
  deleteRecord(id: string): void {
    this.requireDek();
    vaultStorage.remove(recordKey(id));
    writeIndex(readIndex().filter((e) => e.id !== id));
    this.touchModified();
  }

  private touchModified(): void {
    this.header = { ...this.header, modifiedAt: Date.now() };
    writeHeader(this.header);
  }
}
