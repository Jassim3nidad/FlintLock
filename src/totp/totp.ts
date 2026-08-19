import { Buffer } from '../crypto';
import { generateHotp, HotpParams } from './hotp';

export interface TotpParams extends HotpParams {
  /** Seconds. Default 30 per RFC 6238. */
  period: number;
}

/** T0 = 0 (Unix epoch), as specified by RFC 6238 and used by every real-world authenticator. */
export function totpCounter(unixTimeSeconds: number, period: number): number {
  return Math.floor(unixTimeSeconds / period);
}

/** `unixTimeSeconds` defaults to now — pass it explicitly in tests. */
export function generateTotp(secret: Buffer, params: TotpParams, unixTimeSeconds: number = Date.now() / 1000): string {
  return generateHotp(secret, totpCounter(unixTimeSeconds, params.period), params);
}

/** Seconds remaining in the current period — drives the countdown ring. */
export function totpSecondsRemaining(params: Pick<TotpParams, 'period'>, unixTimeSeconds: number = Date.now() / 1000): number {
  return params.period - (Math.floor(unixTimeSeconds) % params.period);
}
