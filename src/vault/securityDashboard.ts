import { UnlockSession } from '../unlock/session';
import { Credential } from '../storage/schema';
import { listCredentials } from './credentialService';
import { listTotpEntries } from './totpService';

export const WEAK_PASSWORD_ENTROPY_THRESHOLD_BITS = 40;
export const OLD_PASSWORD_THRESHOLD_DAYS = 365;

/**
 * Naive charset-based Shannon entropy estimate: which character classes
 * appear, times length. This is fundamentally different from the
 * generator's own entropy figure (src/generator/passwordGenerator.ts),
 * which is *exact* because it controls the random process end to end.
 * This function is guessing at the strength of a string someone else
 * chose — it has no way to know if "Tr0ub4dor&3"-style substitutions
 * came from a dictionary word, whether it's a keyboard walk, or whether
 * it's reused from a famous breach. A real strength meter (zxcvbn-style,
 * pattern- and dictionary-aware) is out of scope here; this is
 * deliberately a coarse, explainable floor, not a claim of precision.
 */
export function estimatePasswordEntropyBits(password: string): number {
  if (password.length === 0) return 0;
  let charsetSize = 0;
  if (/[a-z]/.test(password)) charsetSize += 26;
  if (/[A-Z]/.test(password)) charsetSize += 26;
  if (/[0-9]/.test(password)) charsetSize += 10;
  if (/[^a-zA-Z0-9]/.test(password)) charsetSize += 32; // rough estimate of the printable-symbol class
  return password.length * Math.log2(charsetSize);
}

export interface WeakPasswordFinding {
  credentialId: string;
  title: string;
  estimatedEntropyBits: number;
}

export interface ReusedPasswordFinding {
  credentialIds: string[];
  titles: string[];
}

export interface OldPasswordFinding {
  credentialId: string;
  title: string;
  passwordAgeDays: number;
}

export interface MissingTwoFactorFinding {
  credentialId: string;
  title: string;
}

export interface SecurityDashboardReport {
  weakPasswords: WeakPasswordFinding[];
  reusedPasswords: ReusedPasswordFinding[];
  oldPasswords: OldPasswordFinding[];
  missingTwoFactor: MissingTwoFactorFinding[];
  generatedAt: number;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Computed entirely from vault data already in memory — no network call,
 * no HaveIBeenPwned lookup (out of scope unless separately approved; see
 * the spec's invariant #4). Only considers non-trashed credentials.
 */
export function analyzeSecurity(session: UnlockSession, unixTimeMs: number = Date.now()): SecurityDashboardReport {
  const credentials = listCredentials(session);
  const credentialIdsWithTwoFactor = new Set(
    listTotpEntries(session)
      .filter((entry) => entry.credentialId !== null)
      .map((entry) => entry.credentialId)
  );

  const weakPasswords: WeakPasswordFinding[] = [];
  const oldPasswords: OldPasswordFinding[] = [];
  const missingTwoFactor: MissingTwoFactorFinding[] = [];
  const byPassword = new Map<string, Credential[]>();

  for (const credential of credentials) {
    const entropyBits = estimatePasswordEntropyBits(credential.password);
    if (entropyBits < WEAK_PASSWORD_ENTROPY_THRESHOLD_BITS) {
      weakPasswords.push({ credentialId: credential.id, title: credential.title, estimatedEntropyBits: entropyBits });
    }

    const ageDays = (unixTimeMs - credential.passwordUpdatedAt) / MS_PER_DAY;
    if (ageDays > OLD_PASSWORD_THRESHOLD_DAYS) {
      oldPasswords.push({ credentialId: credential.id, title: credential.title, passwordAgeDays: Math.floor(ageDays) });
    }

    if (!credentialIdsWithTwoFactor.has(credential.id)) {
      missingTwoFactor.push({ credentialId: credential.id, title: credential.title });
    }

    const group = byPassword.get(credential.password);
    if (group) group.push(credential);
    else byPassword.set(credential.password, [credential]);
  }

  const reusedPasswords: ReusedPasswordFinding[] = Array.from(byPassword.values())
    .filter((group) => group.length > 1)
    .map((group) => ({ credentialIds: group.map((c) => c.id), titles: group.map((c) => c.title) }));

  return { weakPasswords, reusedPasswords, oldPasswords, missingTwoFactor, generatedAt: unixTimeMs };
}
