import { randomUUID } from '../crypto/csprng';
import { base32Decode, normalizeBase32Secret } from '../totp/base32';
import { generateHotp, OtpAlgorithm, OtpDigits } from '../totp/hotp';
import { generateTotp, totpSecondsRemaining } from '../totp/totp';
import { buildOtpauthUri, parseOtpauthUri } from '../totp/otpauth';
import { UnlockSession } from '../unlock/session';
import { TotpEntry } from '../storage/schema';

export interface ManualTotpInput {
  credentialId: string | null;
  issuer: string;
  account: string;
  /** Raw, possibly-unpadded/spaced base32 as the user typed it — normalized here. */
  secret: string;
  algorithm: OtpAlgorithm;
  digits: OtpDigits;
  mode: 'totp' | 'hotp';
  period: number;
  /** Required (and only meaningful) for hotp. */
  counter: number | null;
}

function newEntry(fields: Omit<TotpEntry, 'id' | 'recordType' | 'createdAt' | 'updatedAt' | 'deletedAt'>): TotpEntry {
  const now = Date.now();
  return {
    id: randomUUID(),
    recordType: 'totp',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...fields,
  };
}

/** Manual entry path — also covers a plain pasted base32 secret with no otpauth wrapper. */
export function createTotpEntryManually(session: UnlockSession, input: ManualTotpInput): TotpEntry {
  const secret = normalizeBase32Secret(input.secret);
  base32Decode(secret); // throws on invalid base32 — fail at entry time, not first code generation

  if (input.mode === 'hotp' && input.counter === null) {
    throw new Error('HOTP entries require an initial counter value');
  }

  const entry = newEntry({
    credentialId: input.credentialId,
    issuer: input.issuer,
    account: input.account,
    secret,
    algorithm: input.algorithm,
    digits: input.digits,
    mode: input.mode,
    period: input.period,
    counter: input.mode === 'hotp' ? input.counter : null,
  });
  session.vault.putRecord(entry);
  return entry;
}

/** otpauth:// URI path — from a QR scan or pasted text. */
export function createTotpEntryFromOtpauthUri(session: UnlockSession, uri: string, credentialId: string | null): TotpEntry {
  const parsed = parseOtpauthUri(uri);
  const entry = newEntry({
    credentialId,
    issuer: parsed.issuer,
    account: parsed.account,
    secret: parsed.secret,
    algorithm: parsed.algorithm,
    digits: parsed.digits,
    mode: parsed.mode,
    period: parsed.period,
    counter: parsed.counter,
  });
  session.vault.putRecord(entry);
  return entry;
}

export function getTotpEntry(session: UnlockSession, id: string): TotpEntry | undefined {
  const record = session.vault.getRecord(id);
  return record?.recordType === 'totp' ? record : undefined;
}

export function listTotpEntries(session: UnlockSession, options: { includeTrashed?: boolean } = {}): TotpEntry[] {
  const includeTrashed = options.includeTrashed ?? false;
  return session.vault
    .listIndex()
    .filter((entry) => entry.recordType === 'totp')
    .map((entry) => getTotpEntry(session, entry.id))
    .filter((e): e is TotpEntry => e !== undefined && (includeTrashed || e.deletedAt === null));
}

export function getTotpEntriesForCredential(session: UnlockSession, credentialId: string): TotpEntry[] {
  return listTotpEntries(session).filter((e) => e.credentialId === credentialId);
}

export interface CurrentCode {
  code: string;
  /** null for hotp — there is no time-based countdown for an event-based code. */
  secondsRemaining: number | null;
}

/**
 * Generates the current code for `entry`. For HOTP, this also advances
 * and persists the counter — an HOTP code is meant to be single-use, and
 * failing to advance the counter would let the same code be regenerated
 * indefinitely, defeating the point of a counter-based OTP.
 */
export function getCurrentCode(session: UnlockSession, entry: TotpEntry, unixTimeSeconds?: number): CurrentCode {
  if (entry.mode === 'totp') {
    const code = generateTotp(
      base32Decode(entry.secret),
      { algorithm: entry.algorithm, digits: entry.digits, period: entry.period },
      unixTimeSeconds
    );
    return { code, secondsRemaining: totpSecondsRemaining({ period: entry.period }, unixTimeSeconds) };
  }

  if (entry.counter === null) {
    throw new Error(`HOTP entry ${entry.id} is missing its counter`);
  }
  const code = generateHotp(base32Decode(entry.secret), entry.counter, {
    algorithm: entry.algorithm,
    digits: entry.digits,
  });
  session.vault.putRecord({ ...entry, counter: entry.counter + 1, updatedAt: Date.now() });
  return { code, secondsRemaining: null };
}

/** For showing/exporting an entry as a QR code. */
export function totpEntryToOtpauthUri(entry: TotpEntry): string {
  return buildOtpauthUri({
    mode: entry.mode,
    issuer: entry.issuer,
    account: entry.account,
    secret: entry.secret,
    algorithm: entry.algorithm,
    digits: entry.digits,
    period: entry.period,
    counter: entry.counter,
  });
}

export function updateTotpEntry(
  session: UnlockSession,
  id: string,
  changes: Partial<Pick<TotpEntry, 'issuer' | 'account' | 'credentialId'>>
): TotpEntry {
  const existing = getTotpEntry(session, id);
  if (!existing) throw new Error(`No TOTP entry with id ${id}`);
  const updated: TotpEntry = { ...existing, ...changes, updatedAt: Date.now() };
  session.vault.putRecord(updated);
  return updated;
}

export function softDeleteTotpEntry(session: UnlockSession, id: string): void {
  const existing = getTotpEntry(session, id);
  if (!existing) throw new Error(`No TOTP entry with id ${id}`);
  session.vault.putRecord({ ...existing, deletedAt: Date.now(), updatedAt: Date.now() });
}

export function hardDeleteTotpEntry(session: UnlockSession, id: string): void {
  session.vault.deleteRecord(id);
}
