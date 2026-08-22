import { UnlockSession } from '../unlock/session';
import { CustomField } from '../storage/schema';
import { listCredentials } from '../vault/credentialService';
import { listTags } from '../vault/tagService';

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Standard KeePass fields it treats as sensitive in its UI by default. */
const PROTECTED_KEYS = new Set(['Password']);

function stringField(key: string, value: string, protect: boolean): string {
  const protectedAttr = protect ? ' Protected="True"' : '';
  return `      <String>\n        <Key>${xmlEscape(key)}</Key>\n        <Value${protectedAttr}>${xmlEscape(value)}</Value>\n      </String>`;
}

function customFieldEntries(fields: CustomField[]): string[] {
  // A custom field marked `hidden` in Flintlock is exactly KeePass's
  // notion of a protected field — carry that over rather than only
  // protecting fields that happen to be named "Password".
  return fields.map((field) => stringField(field.key, field.value, field.type === 'hidden'));
}

export interface KeePassXmlExportOptions {
  /** Same purpose as CsvExportOptions.acknowledgeRisk — see csvExport.ts. */
  acknowledgeRisk: true;
}

/**
 * KeePass 2 "Export to XML" schema — the documented plaintext interchange
 * format KeePass/KeePassXC both support for import, distinct from the
 * encrypted binary .kdbx format. Plaintext: every field, including the
 * password, is fully readable by anything with access to the file.
 */
export async function exportKeePassXml(session: UnlockSession, options: KeePassXmlExportOptions): Promise<string> {
  if (options.acknowledgeRisk !== true) {
    throw new Error('KeePass XML export produces a plaintext file — acknowledgeRisk must be true');
  }

  const tagsById = new Map((await listTags(session)).map((tag) => [tag.id, tag.name]));
  const credentials = await listCredentials(session);
  const entries = credentials.map((credential) => {
    const tagNames = credential.tagIds.map((id) => tagsById.get(id) ?? id).join(';');
    const fields = [
      stringField('Title', credential.title, PROTECTED_KEYS.has('Title')),
      stringField('UserName', credential.username, PROTECTED_KEYS.has('UserName')),
      stringField('Password', credential.password, PROTECTED_KEYS.has('Password')),
      stringField('URL', credential.urls[0] ?? '', PROTECTED_KEYS.has('URL')),
      stringField('Notes', credential.notes, PROTECTED_KEYS.has('Notes')),
      ...customFieldEntries(credential.customFields),
    ].join('\n');

    return ['    <Entry>', fields, tagNames ? `      <Tags>${xmlEscape(tagNames)}</Tags>` : null, '    </Entry>']
      .filter((line): line is string => line !== null)
      .join('\n');
  });

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<KeePassFile>',
    '  <Meta>',
    '    <Generator>Flintlock</Generator>',
    '  </Meta>',
    '  <Root>',
    '    <Group>',
    '      <Name>Flintlock Export</Name>',
    ...entries,
    '    </Group>',
    '  </Root>',
    '</KeePassFile>',
  ].join('\n');
}
