import { base32Decode, normalizeBase32Secret } from './base32';
import { OtpAlgorithm, OtpDigits } from './hotp';

export interface ParsedOtpauth {
  mode: 'totp' | 'hotp';
  issuer: string;
  account: string;
  /** Normalized (uppercase, padded) base32 — already validated as decodable. */
  secret: string;
  algorithm: OtpAlgorithm;
  digits: OtpDigits;
  period: number;
  /** Only meaningful (non-null) for hotp. */
  counter: number | null;
}

function normalizeAlgorithm(raw: string | undefined): OtpAlgorithm {
  if (raw === undefined) return 'SHA1';
  const upper = raw.toUpperCase();
  if (upper === 'SHA1' || upper === 'SHA256' || upper === 'SHA512') return upper;
  throw new Error(`Unsupported otpauth algorithm: ${raw}`);
}

function normalizeDigits(raw: string | undefined): OtpDigits {
  if (raw === undefined) return 6;
  if (raw === '6') return 6;
  if (raw === '8') return 8;
  throw new Error(`Unsupported otpauth digits value: ${raw} (must be 6 or 8)`);
}

/** Manual query-string parsing rather than URLSearchParams — not reliably available across Hermes versions. */
function parseQueryString(query: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const eqIdx = pair.indexOf('=');
    const key = decodeURIComponent(eqIdx === -1 ? pair : pair.slice(0, eqIdx));
    const value = eqIdx === -1 ? '' : decodeURIComponent(pair.slice(eqIdx + 1));
    params[key] = value;
  }
  return params;
}

/**
 * Parses an `otpauth://totp/...` or `otpauth://hotp/...` URI (from a QR
 * scan or pasted text). Manual parsing rather than the WHATWG URL API,
 * which isn't reliably available across Hermes versions without a
 * polyfill this app doesn't otherwise need.
 */
export function parseOtpauthUri(uri: string): ParsedOtpauth {
  const match = /^otpauth:\/\/(totp|hotp)\/([^?]*)\?(.*)$/i.exec(uri.trim());
  if (!match) {
    throw new Error('Not a valid otpauth:// URI');
  }
  const [, modeRaw, labelRaw, queryString] = match;
  const mode = modeRaw!.toLowerCase() as 'totp' | 'hotp';
  const label = decodeURIComponent(labelRaw!);
  const params = parseQueryString(queryString!);

  let issuer = params.issuer ?? '';
  let account = label;
  const colonIdx = label.indexOf(':');
  if (colonIdx !== -1) {
    const labelIssuer = label.slice(0, colonIdx).trim();
    account = label.slice(colonIdx + 1).trim();
    if (!issuer) issuer = labelIssuer;
  }

  if (!params.secret) {
    throw new Error('otpauth URI is missing the required secret parameter');
  }
  const secret = normalizeBase32Secret(params.secret);
  base32Decode(secret); // throws on invalid base32 — validate eagerly, not on first code generation

  const algorithm = normalizeAlgorithm(params.algorithm);
  const digits = normalizeDigits(params.digits);

  const period = params.period !== undefined ? Number(params.period) : 30;
  if (!Number.isInteger(period) || period <= 0) {
    throw new Error(`Invalid otpauth period: ${params.period}`);
  }

  let counter: number | null = null;
  if (mode === 'hotp') {
    if (params.counter === undefined) {
      throw new Error('hotp otpauth URI is missing the required counter parameter');
    }
    counter = Number(params.counter);
    if (!Number.isInteger(counter) || counter < 0) {
      throw new Error(`Invalid otpauth counter: ${params.counter}`);
    }
  }

  return { mode, issuer, account, secret, algorithm, digits, period, counter };
}

export interface BuildOtpauthInput {
  mode: 'totp' | 'hotp';
  issuer: string;
  account: string;
  /** Normalized base32. */
  secret: string;
  algorithm: OtpAlgorithm;
  digits: OtpDigits;
  period: number;
  counter: number | null;
}

/** Inverse of parseOtpauthUri — for showing/exporting an entry as a QR code or text. */
export function buildOtpauthUri(entry: BuildOtpauthInput): string {
  const label = entry.issuer ? `${entry.issuer}:${entry.account}` : entry.account;

  const params: [string, string][] = [['secret', entry.secret]];
  if (entry.issuer) params.push(['issuer', entry.issuer]);
  if (entry.algorithm !== 'SHA1') params.push(['algorithm', entry.algorithm]);
  if (entry.digits !== 6) params.push(['digits', String(entry.digits)]);
  if (entry.mode === 'totp' && entry.period !== 30) params.push(['period', String(entry.period)]);
  if (entry.mode === 'hotp') params.push(['counter', String(entry.counter ?? 0)]);

  const query = params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  return `otpauth://${entry.mode}/${encodeURIComponent(label)}?${query}`;
}
