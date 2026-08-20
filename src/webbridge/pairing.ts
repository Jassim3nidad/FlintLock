import { Buffer, randomBytes } from '../crypto';
import { base32Decode, base32Encode } from '../totp/base32';

/**
 * 256-bit, CSPRNG-generated. Used for both the QR path and the manual-
 * entry fallback — see docs/WEB_BRIDGE_THREAT_MODEL.md for why the
 * lengths were kept equal rather than shortening the typed form. Never
 * transmitted over the network in any form; its only channel is optical
 * (QR) or manual transcription.
 */
export function generatePairingSecret(): Buffer {
  return randomBytes(32);
}

/** Groups of 4 characters, hyphen-separated, purely for readability when typing. */
export function formatSecretForManualEntry(secret: Buffer): string {
  const raw = base32Encode(secret).replace(/[=]+$/, '');
  return raw.match(/.{1,4}/g)!.join('-');
}

export function parseManualEntrySecret(text: string): Buffer {
  const cleaned = text.toUpperCase().replace(/[\s-]+/g, '');
  const padded = cleaned + '='.repeat((8 - (cleaned.length % 8)) % 8);
  const decoded = base32Decode(padded);
  if (decoded.length !== 32) {
    throw new Error('Invalid pairing code: wrong length after decoding');
  }
  return decoded;
}

export interface QrPayload {
  /** Phone's current LAN IP — a literal address, never a hostname. See threat model: "DNS/mDNS spoofing." */
  ip: string;
  port: number;
  /** Base32, matches formatSecretForManualEntry's alphabet (without the hyphens). */
  secret: string;
  sessionId: string;
  expiresAt: number;
}

const QR_SCHEME = 'flintlock-bridge';

export function encodeQrPayload(payload: QrPayload): string {
  return `${QR_SCHEME}://${payload.ip}:${payload.port}/${payload.sessionId}?secret=${payload.secret}&expiresAt=${payload.expiresAt}`;
}

export function decodeQrPayload(text: string): QrPayload {
  const match = new RegExp(`^${QR_SCHEME}://([^:]+):(\\d+)/([^?]+)\\?(.*)$`).exec(text.trim());
  if (!match) {
    throw new Error('Not a valid Web Bridge pairing code');
  }
  const [, ip, portStr, sessionId, queryString] = match;

  const params: Record<string, string> = {};
  for (const pair of queryString!.split('&')) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) continue;
    params[decodeURIComponent(pair.slice(0, eqIdx))] = decodeURIComponent(pair.slice(eqIdx + 1));
  }

  const port = Number(portStr);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid port in pairing code: ${portStr}`);
  }
  if (!params.secret) {
    throw new Error('Pairing code is missing the secret parameter');
  }
  const expiresAt = Number(params.expiresAt);
  if (!Number.isFinite(expiresAt)) {
    throw new Error('Pairing code is missing or has an invalid expiresAt parameter');
  }

  return { ip: ip!, port, secret: params.secret, sessionId: sessionId!, expiresAt };
}
