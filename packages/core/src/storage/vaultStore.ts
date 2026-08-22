import { Buffer } from 'buffer';
import { aesGcmDecrypt, aesGcmEncrypt } from '../crypto/cipher';
import { dekWrapAad, generateDek, generateSalt, unwrapKey, wrapKey } from '../crypto/envelope';
import { deriveKek } from '../crypto/kdf';
import { randomUUID } from '../crypto/csprng';
import { KeyHandle } from '../crypto/CryptoProvider';
import { KdfParams, Pbkdf2Params, PBKDF2_DEFAULT_ITERATIONS, WrappedKey } from '../crypto/types';
import { getCryptoProvider, getSecureStore } from '../platform';
import { packEnvelope, unpackEnvelope } from './serialization';
import { DEFAULT_VAULT_SETTINGS, SCHEMA_VERSION, VAULT_FORMAT_VERSION, VaultHeader, VaultRecord } from './schema';
import { recordAad } from '../crypto/cipher';

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

async function readHeader(): Promise<VaultHeader | undefined> {
  const raw = await getSecureStore().getItem(HEADER_KEY);
  return raw ? (JSON.parse(raw.toString('utf8')) as VaultHeader) : undefined;
}

function writeHeader(header: VaultHeader): Promise<void> {
  return getSecureStore().setItem(HEADER_KEY, Buffer.from(JSON.stringify(header), 'utf8'));
}

async function readIndex(): Promise<IndexEntry[]> {
  const raw = await getSecureStore().getItem(INDEX_KEY);
  return raw ? (JSON.parse(raw.toString('utf8')) as IndexEntry[]) : [];
}

function writeIndex(entries: IndexEntry[]): Promise<void> {
  return getSecureStore().setItem(INDEX_KEY, Buffer.from(JSON.stringify(entries), 'utf8'));
}

/**
 * Owns one vault's persisted state: the plaintext header (KDF params,
 * salt, wrapped DEK) and per-record encrypted storage. See
 * docs/CRYPTO.md for the key hierarchy this implements.
 *
 * Every method here is async, including on native where the concrete
 * SecureStore (MMKV) resolves synchronously in practice — see
 * SecureStore.ts's doc comment for why: a sync-looking API over an async
 * write would let a failed web write disappear silently, and this is a
 * password manager.
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
 * record once during a search is sub-second, and a small bounded LRU
 * cache (RecordCache) amortizes repeat lookups. Revisit only if real
 * vault sizes make cold full-vault search noticeably slow.
 */
export class VaultStore {
  private header: VaultHeader;
  private dek: KeyHandle | null;

  private constructor(header: VaultHeader, dek: KeyHandle) {
    this.header = header;
    this.dek = dek;
  }

  static async exists(): Promise<boolean> {
    return getSecureStore().hasItem(HEADER_KEY);
  }

  /**
   * Reads the plaintext header's settings without deriving any key or
   * unlocking anything — the header (unlike vault contents) never
   * required a key to read in the first place. For screens that need to
   * know something like biometricUnlockEnabled *before* the vault is
   * open, e.g. to decide whether to show a biometric-unlock button on
   * the lock screen.
   */
  static async peekSettings(): Promise<VaultHeader['settings'] | undefined> {
    return (await readHeader())?.settings;
  }

  /** Creates a brand-new, empty vault. Throws if one already exists on this device. */
  static async create(masterPassword: Buffer, kdfParams: KdfParams = DEFAULT_PBKDF2_PARAMS): Promise<VaultStore> {
    if (await VaultStore.exists()) {
      throw new Error('A vault already exists on this device');
    }

    const provider = getCryptoProvider();
    const vaultId = randomUUID();
    const salt = generateSalt();
    const dek = await generateDek();
    const kdfParamsVersion = 1;

    const kek = await deriveKek(masterPassword, kdfParams, salt);
    let wrapped: WrappedKey;
    try {
      wrapped = await wrapKey(dek, kek, dekWrapAad(vaultId, kdfParamsVersion));
    } finally {
      provider.disposeKey(kek);
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
    await writeHeader(header);
    await writeIndex([]);

    return new VaultStore(header, dek);
  }

  /**
   * Opens the existing on-device vault. This IS master-password
   * verification (see docs/CRYPTO.md) — a wrong password rejects from
   * the DEK-unwrap step, with no separate check.
   */
  static async open(masterPassword: Buffer): Promise<VaultStore> {
    const header = await readHeader();
    if (!header) {
      throw new Error('No vault exists on this device');
    }

    const dek = await VaultStore.unwrapDekWithPassword(header, masterPassword);

    return new VaultStore(header, dek);
  }

  /**
   * Re-verifies the master password and returns the DEK directly,
   * without constructing a VaultStore. For flows that need the DEK
   * itself but not a whole session — specifically, enrolling biometric
   * unlock while already unlocked: the spec requires re-entering the
   * master password at enrollment time even though the session is
   * already authenticated, and the biometric key wraps the same DEK the
   * password path would unwrap. Same fail-closed guarantee as open().
   */
  static async verifyPasswordAndGetDek(masterPassword: Buffer): Promise<KeyHandle> {
    const header = await readHeader();
    if (!header) {
      throw new Error('No vault exists on this device');
    }
    return VaultStore.unwrapDekWithPassword(header, masterPassword);
  }

  private static async unwrapDekWithPassword(header: VaultHeader, masterPassword: Buffer): Promise<KeyHandle> {
    const provider = getCryptoProvider();
    const salt = Buffer.from(header.salt, 'base64');
    const kek = await deriveKek(masterPassword, header.kdf, salt);
    const wrapped: WrappedKey = {
      iv: Buffer.from(header.wrappedDek.iv, 'base64'),
      ciphertext: Buffer.from(header.wrappedDek.ciphertext, 'base64'),
      authTag: Buffer.from(header.wrappedDek.authTag, 'base64'),
    };

    try {
      return await unwrapKey(wrapped, kek, dekWrapAad(header.vaultId, header.kdfParamsVersion));
    } finally {
      provider.disposeKey(kek);
    }
  }

  /**
   * Opens the vault with an already-known DEK, bypassing password
   * derivation entirely. For the biometric-unlock path: the DEK comes
   * back only after a successful hardware- or WebAuthn-gated biometric
   * check (see packages/core/src/biometric), which already provides its
   * own authenticated-encryption guarantee on that value — there is
   * nothing meaningful left for this layer to re-verify.
   */
  static async openWithDek(dek: KeyHandle): Promise<VaultStore> {
    const header = await readHeader();
    if (!header) {
      throw new Error('No vault exists on this device');
    }
    return new VaultStore(header, dek);
  }

  get settings() {
    return this.header.settings;
  }

  get vaultId(): string {
    return this.header.vaultId;
  }

  async updateSettings(settings: Partial<VaultHeader['settings']>): Promise<void> {
    this.header = { ...this.header, settings: { ...this.header.settings, ...settings } };
    await writeHeader(this.header);
  }

  /** Wipes the DEK from memory. All record access throws until re-opened. */
  lock(): void {
    if (this.dek) {
      getCryptoProvider().disposeKey(this.dek);
      this.dek = null;
    }
  }

  isUnlocked(): boolean {
    return this.dek !== null;
  }

  private requireDek(): KeyHandle {
    if (!this.dek) throw new Error('Vault is locked');
    return this.dek;
  }

  /** Non-sensitive {id, recordType} pairs for every record — safe to read without decrypting. */
  listIndex(): Promise<IndexEntry[]> {
    return readIndex();
  }

  /** Encrypts and persists `record`, creating or overwriting by `record.id`. */
  async putRecord(record: VaultRecord): Promise<void> {
    const dek = this.requireDek();
    const plaintext = Buffer.from(JSON.stringify(record), 'utf8');
    const envelope = await aesGcmEncrypt(plaintext, dek, recordAad(record.id, SCHEMA_VERSION));
    await getSecureStore().setItem(recordKey(record.id), packEnvelope(envelope));

    const index = await readIndex();
    const existing = index.findIndex((e) => e.id === record.id);
    const entry: IndexEntry = { id: record.id, recordType: record.recordType };
    if (existing === -1) index.push(entry);
    else index[existing] = entry;
    await writeIndex(index);

    await this.touchModified();
  }

  /**
   * Decrypts and returns the record with `id`, or undefined if it doesn't
   * exist. Rejects with DecryptionError — never returns partial data — if
   * the stored bytes are corrupted or tampered with.
   */
  async getRecord(id: string): Promise<VaultRecord | undefined> {
    const dek = this.requireDek();
    const packed = await getSecureStore().getItem(recordKey(id));
    if (!packed) return undefined;

    const envelope = unpackEnvelope(packed);
    const plaintext = await aesGcmDecrypt(envelope, dek, recordAad(id, SCHEMA_VERSION));
    return JSON.parse(plaintext.toString('utf8')) as VaultRecord;
  }

  /** Hard-deletes the record with `id`. Soft-delete (trash) is a field on the record itself, not a storage concern. */
  async deleteRecord(id: string): Promise<void> {
    this.requireDek();
    await getSecureStore().removeItem(recordKey(id));
    await writeIndex((await readIndex()).filter((e) => e.id !== id));
    await this.touchModified();
  }

  private async touchModified(): Promise<void> {
    this.header = { ...this.header, modifiedAt: Date.now() };
    await writeHeader(this.header);
  }
}
