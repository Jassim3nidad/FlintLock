/**
 * RFC 6238 Appendix B known-answer vectors, extracted programmatically
 * from the raw fetched RFC text (not hand-transcribed) — same discipline
 * as the PBKDF2 fixture, after an earlier transcription slip there.
 * T0 = 0, time step X = 30s, 8-digit codes.
 */
import { OtpAlgorithm } from '../../totp/hotp';

export interface TotpVector {
  unixTimeSeconds: number;
  algorithm: OtpAlgorithm;
  secretHex: string;
  expectedCode: string;
}

const SECRET_HEX: Record<OtpAlgorithm, string> = {
  "SHA1": "3132333435363738393031323334353637383930",
  "SHA256": "3132333435363738393031323334353637383930313233343536373839303132",
  "SHA512": "31323334353637383930313233343536373839303132333435363738393031323334353637383930313233343536373839303132333435363738393031323334"
};

const RAW_ROWS: { time: number; code: string; algo: OtpAlgorithm }[] = [
  {
    "time": 59,
    "code": "94287082",
    "algo": "SHA1"
  },
  {
    "time": 59,
    "code": "46119246",
    "algo": "SHA256"
  },
  {
    "time": 59,
    "code": "90693936",
    "algo": "SHA512"
  },
  {
    "time": 1111111109,
    "code": "07081804",
    "algo": "SHA1"
  },
  {
    "time": 1111111109,
    "code": "68084774",
    "algo": "SHA256"
  },
  {
    "time": 1111111109,
    "code": "25091201",
    "algo": "SHA512"
  },
  {
    "time": 1111111111,
    "code": "14050471",
    "algo": "SHA1"
  },
  {
    "time": 1111111111,
    "code": "67062674",
    "algo": "SHA256"
  },
  {
    "time": 1111111111,
    "code": "99943326",
    "algo": "SHA512"
  },
  {
    "time": 1234567890,
    "code": "89005924",
    "algo": "SHA1"
  },
  {
    "time": 1234567890,
    "code": "91819424",
    "algo": "SHA256"
  },
  {
    "time": 1234567890,
    "code": "93441116",
    "algo": "SHA512"
  },
  {
    "time": 2000000000,
    "code": "69279037",
    "algo": "SHA1"
  },
  {
    "time": 2000000000,
    "code": "90698825",
    "algo": "SHA256"
  },
  {
    "time": 2000000000,
    "code": "38618901",
    "algo": "SHA512"
  },
  {
    "time": 20000000000,
    "code": "65353130",
    "algo": "SHA1"
  },
  {
    "time": 20000000000,
    "code": "77737706",
    "algo": "SHA256"
  },
  {
    "time": 20000000000,
    "code": "47863826",
    "algo": "SHA512"
  }
];

export const TOTP_VECTORS: TotpVector[] = RAW_ROWS.map((r) => ({
  unixTimeSeconds: r.time,
  algorithm: r.algo,
  secretHex: SECRET_HEX[r.algo],
  expectedCode: r.code,
}));
