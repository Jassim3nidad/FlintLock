import { UnlockSession } from '../unlock/session';
import { listCredentials } from '../vault/credentialService';
import { listTags } from '../vault/tagService';

const CSV_COLUMNS = ['title', 'username', 'password', 'urls', 'notes', 'tags', 'favorite'] as const;

/** Cell values that, opened unmodified in Excel/Sheets, execute as a formula. */
const FORMULA_INJECTION_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

/**
 * Neutralizes CSV/spreadsheet formula injection: a cell value starting
 * with =, +, -, or @ (or a leading tab/CR, both accepted by some parsers
 * as a formula prefix) executes as a formula the instant the file is
 * opened in Excel or Sheets. Prefixing with a bare apostrophe is the
 * standard mitigation — spreadsheet apps treat a leading `'` as "force
 * text" and strip it from the displayed value, but it stops formula
 * evaluation.
 */
function neutralizeFormulaInjection(value: string): string {
  return FORMULA_INJECTION_PREFIXES.some((prefix) => value.startsWith(prefix)) ? `'${value}` : value;
}

function csvEscapeCell(rawValue: string): string {
  const value = neutralizeFormulaInjection(rawValue);
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function csvRow(values: string[]): string {
  return values.map(csvEscapeCell).join(',');
}

export interface CsvExportOptions {
  /**
   * Exporting plaintext requires the caller to have already shown the
   * spec-mandated blocking warning dialog ("this file is readable by
   * anything on the device") and gotten explicit confirmation. This flag
   * exists so a UI bug that skips the dialog fails loudly instead of
   * silently producing a plaintext file.
   */
  acknowledgeRisk: true;
}

/** Plaintext. Every field, including the password, is fully readable by anything with access to the resulting file. */
export async function exportCsv(session: UnlockSession, options: CsvExportOptions): Promise<string> {
  if (options.acknowledgeRisk !== true) {
    throw new Error('CSV export produces a plaintext file — acknowledgeRisk must be true');
  }

  const tagsById = new Map((await listTags(session)).map((tag) => [tag.id, tag.name]));
  const lines = [csvRow([...CSV_COLUMNS])];

  for (const credential of await listCredentials(session)) {
    const tagNames = credential.tagIds.map((id) => tagsById.get(id) ?? id).join(';');
    lines.push(
      csvRow([
        credential.title,
        credential.username,
        credential.password,
        credential.urls.join(';'),
        credential.notes,
        tagNames,
        String(credential.favorite),
      ])
    );
  }

  return lines.join('\r\n') + '\r\n';
}
