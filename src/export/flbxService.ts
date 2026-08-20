import { Buffer, KdfParams } from '../crypto';
import { DEFAULT_PBKDF2_PARAMS } from '../storage/vaultStore';
import { VaultRecord } from '../storage/schema';
import { UnlockSession } from '../unlock/session';
import { decodeFlbx, encodeFlbx, FlbxFormatError } from './flbxFormat';

export interface FlbxPayload {
  exportedAt: number;
  sourceVaultId: string;
  records: VaultRecord[];
}

/**
 * `masterPassword` must already be re-verified by the caller immediately
 * before calling this — per spec, export requires master-password
 * re-entry right before it happens, but that re-entry/verification is a
 * UI-flow concern (re-running the normal unlock check) this module
 * doesn't duplicate. This function does not verify the password against
 * the vault; it only uses it to derive a fresh, independent export key.
 */
export async function exportFlbx(
  session: UnlockSession,
  masterPassword: Buffer,
  kdfParams: KdfParams = DEFAULT_PBKDF2_PARAMS
): Promise<Buffer> {
  const records = session.vault
    .listIndex()
    .map((entry) => session.vault.getRecord(entry.id))
    .filter((r): r is VaultRecord => r !== undefined);

  const payload: FlbxPayload = {
    exportedAt: Date.now(),
    sourceVaultId: session.vault.vaultId,
    records,
  };

  return encodeFlbx(masterPassword, JSON.stringify(payload), kdfParams);
}

export type ImportAction = 'add' | 'update' | 'unchanged';

export interface ImportPreviewEntry {
  id: string;
  recordType: VaultRecord['recordType'];
  action: ImportAction;
}

export interface ImportPreview {
  payload: FlbxPayload;
  entries: ImportPreviewEntry[];
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (typeof a !== 'object') return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }

  const aKeys = Object.keys(a as object);
  const bKeys = Object.keys(b as object);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

/**
 * Decrypts and validates `file`, then classifies every record against
 * the live vault without writing anything — the "preview of what will
 * change before committing" the spec requires. Call commitFlbxImport()
 * with the result to actually apply it.
 */
export async function previewFlbxImport(session: UnlockSession, masterPassword: Buffer, file: Buffer): Promise<ImportPreview> {
  const json = await decodeFlbx(masterPassword, file);

  let payload: FlbxPayload;
  try {
    payload = JSON.parse(json) as FlbxPayload;
  } catch {
    throw new FlbxFormatError('Corrupt .flbx payload (not valid JSON after decryption)');
  }
  if (!Array.isArray(payload.records)) {
    throw new FlbxFormatError('Corrupt .flbx payload (missing records array)');
  }

  const entries: ImportPreviewEntry[] = payload.records.map((record) => {
    const existing = session.vault.getRecord(record.id);
    let action: ImportAction;
    if (!existing) action = 'add';
    else if (deepEqual(existing, record)) action = 'unchanged';
    else action = 'update';
    return { id: record.id, recordType: record.recordType, action };
  });

  return { payload, entries };
}

export type ImportMode = 'merge' | 'replace';

/**
 * Applies a previously-computed preview. Idempotent under 'merge': an
 * unchanged record is skipped rather than rewritten, so importing the
 * same file twice in a row is a no-op the second time. 'replace' wipes
 * every existing record first, then writes the imported set — the
 * imported file becomes the vault's complete contents.
 */
export function commitFlbxImport(session: UnlockSession, preview: ImportPreview, mode: ImportMode): void {
  if (mode === 'replace') {
    for (const entry of session.vault.listIndex()) {
      session.vault.deleteRecord(entry.id);
    }
  }

  for (const entry of preview.entries) {
    if (mode === 'merge' && entry.action === 'unchanged') continue;
    const record = preview.payload.records.find((r) => r.id === entry.id)!;
    session.vault.putRecord(record);
  }
}
