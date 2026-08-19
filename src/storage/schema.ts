import { KdfParams } from '../crypto';

/**
 * Bumped whenever a record's shape changes in a way old code can't read.
 * Carried in each record's AAD (see cipher.ts's recordAad) so a ciphertext
 * can't be replayed against a different schema version than it was
 * encrypted under.
 */
export const SCHEMA_VERSION = 1;

export type CustomFieldType = 'text' | 'hidden' | 'url' | 'number' | 'date';

export interface CustomField {
  key: string;
  value: string;
  type: CustomFieldType;
}

export interface PasswordHistoryEntry {
  password: string;
  changedAt: number;
}

export interface Credential {
  id: string;
  recordType: 'credential';
  title: string;
  username: string;
  password: string;
  urls: string[];
  notes: string;
  tagIds: string[];
  customFields: CustomField[];
  favorite: boolean;
  passwordHistory: PasswordHistoryEntry[];
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number | null;
  /** Soft-delete timestamp; null while active. Hard delete removes the record entirely. */
  deletedAt: number | null;
}

export type TotpAlgorithm = 'SHA1' | 'SHA256' | 'SHA512';

export interface TotpEntry {
  id: string;
  recordType: 'totp';
  /** Null for a standalone entry not attached to any credential. */
  credentialId: string | null;
  issuer: string;
  account: string;
  /** Base32-encoded shared secret. */
  secret: string;
  algorithm: TotpAlgorithm;
  digits: 6 | 8;
  mode: 'totp' | 'hotp';
  /** Seconds; TOTP only. */
  period: number;
  /** HOTP only. */
  counter: number | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface Tag {
  id: string;
  recordType: 'tag';
  name: string;
  color: string;
}

export type VaultRecord = Credential | TotpEntry | Tag;

export interface VaultSettings {
  autoLock: 'immediate' | '30s' | '1m' | '5m' | '15m' | '30m' | 'never';
  lockOnBackground: boolean;
  clipboardClearSeconds: number;
}

export const DEFAULT_VAULT_SETTINGS: VaultSettings = {
  autoLock: '1m',
  lockOnBackground: true,
  clipboardClearSeconds: 30,
};

/**
 * Stored in plaintext — necessarily, since the KDF params and salt have to
 * be readable before a key can be derived from anything. None of this
 * leaks vault contents: KDF params/salt are public by cryptographic
 * convention, and the wrapped DEK is itself AES-256-GCM-ciphertext.
 */
export interface VaultHeader {
  formatVersion: number;
  vaultId: string;
  kdf: KdfParams;
  kdfParamsVersion: number;
  /** Base64. */
  salt: string;
  wrappedDek: {
    /** Base64. */
    iv: string;
    /** Base64. */
    ciphertext: string;
    /** Base64. */
    authTag: string;
  };
  createdAt: number;
  modifiedAt: number;
  settings: VaultSettings;
}

export const VAULT_FORMAT_VERSION = 1;
