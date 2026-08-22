import { UnlockSession } from '../unlock/session';
import { Credential } from '../storage/schema';
import { RecordCache } from './recordCache';

/**
 * Substring search over title, username, and URLs. Decrypts each
 * candidate record on demand through `cache` rather than maintaining a
 * separate search index — see the tradeoff writeup in
 * packages/core/src/storage/vaultStore.ts. `customFields` marked
 * `hidden` are excluded from the search haystack, per spec.
 */
export async function searchCredentials(session: UnlockSession, cache: RecordCache, query: string): Promise<Credential[]> {
  const q = query.trim().toLowerCase();
  const results: Credential[] = [];

  for (const entry of await session.vault.listIndex()) {
    if (entry.recordType !== 'credential') continue;
    const record = (await cache.get(entry.id)) as Credential | undefined;
    if (!record || record.deletedAt !== null) continue;
    if (q === '' || matches(record, q)) results.push(record);
  }

  return results;
}

function matches(record: Credential, query: string): boolean {
  const haystackParts = [
    record.title,
    record.username,
    ...record.urls,
    ...record.customFields.filter((f) => f.type !== 'hidden').map((f) => f.value),
  ];
  return haystackParts.some((part) => part.toLowerCase().includes(query));
}
