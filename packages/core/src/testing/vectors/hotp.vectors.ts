/**
 * RFC 4226 Appendix D known-answer vectors, extracted programmatically
 * from the raw fetched RFC text (not hand-transcribed).
 * Secret = ASCII "12345678901234567890" (0x3132333435363738393031323334353637383930), HMAC-SHA1, 6 digits.
 */
export const HOTP_SECRET_HEX = '3132333435363738393031323334353637383930';

export const HOTP_VECTORS: { counter: number; expectedCode: string }[] = [
  "755224",
  "287082",
  "359152",
  "969429",
  "338314",
  "254676",
  "287922",
  "162583",
  "399871",
  "520489"
].map((code: string, counter: number) => ({ counter, expectedCode: code }));
