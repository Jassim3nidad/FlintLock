import { buildOtpauthUri, parseOtpauthUri } from '../otpauth';

describe('parseOtpauthUri', () => {
  it('parses a typical Google-Authenticator-style TOTP URI', () => {
    const parsed = parseOtpauthUri('otpauth://totp/Example:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example');
    expect(parsed).toEqual({
      mode: 'totp',
      issuer: 'Example',
      account: 'alice@example.com',
      secret: 'JBSWY3DPEHPK3PXP',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      counter: null,
    });
  });

  it('defaults algorithm to SHA1, digits to 6, period to 30 when omitted', () => {
    const parsed = parseOtpauthUri('otpauth://totp/alice?secret=JBSWY3DPEHPK3PXP');
    expect(parsed.algorithm).toBe('SHA1');
    expect(parsed.digits).toBe(6);
    expect(parsed.period).toBe(30);
  });

  it('honors explicit algorithm, digits, and period', () => {
    const parsed = parseOtpauthUri('otpauth://totp/alice?secret=JBSWY3DPEHPK3PXP&algorithm=SHA512&digits=8&period=60');
    expect(parsed.algorithm).toBe('SHA512');
    expect(parsed.digits).toBe(8);
    expect(parsed.period).toBe(60);
  });

  it('takes issuer from the label when no issuer query param is present', () => {
    const parsed = parseOtpauthUri('otpauth://totp/MyBank:alice?secret=JBSWY3DPEHPK3PXP');
    expect(parsed.issuer).toBe('MyBank');
    expect(parsed.account).toBe('alice');
  });

  it('treats the whole label as the account when there is no colon and no issuer param', () => {
    const parsed = parseOtpauthUri('otpauth://totp/alice?secret=JBSWY3DPEHPK3PXP');
    expect(parsed.issuer).toBe('');
    expect(parsed.account).toBe('alice');
  });

  it('parses HOTP with a required counter', () => {
    const parsed = parseOtpauthUri('otpauth://hotp/alice?secret=JBSWY3DPEHPK3PXP&counter=5');
    expect(parsed.mode).toBe('hotp');
    expect(parsed.counter).toBe(5);
  });

  it('normalizes an unpadded, spaced secret', () => {
    const parsed = parseOtpauthUri('otpauth://totp/alice?secret=jbswy3dp%20ehpk%203pxp');
    expect(parsed.secret).toBe('JBSWY3DPEHPK3PXP');
  });

  it('rejects a non-otpauth URI', () => {
    expect(() => parseOtpauthUri('https://example.com')).toThrow(/not a valid otpauth/i);
  });

  it('rejects a missing secret', () => {
    expect(() => parseOtpauthUri('otpauth://totp/alice?issuer=X')).toThrow(/secret/i);
  });

  it('rejects an invalid base32 secret', () => {
    expect(() => parseOtpauthUri('otpauth://totp/alice?secret=not-valid-base32!!!')).toThrow();
  });

  it('rejects hotp missing counter', () => {
    expect(() => parseOtpauthUri('otpauth://hotp/alice?secret=JBSWY3DPEHPK3PXP')).toThrow(/counter/i);
  });

  it('rejects an unsupported algorithm', () => {
    expect(() => parseOtpauthUri('otpauth://totp/alice?secret=JBSWY3DPEHPK3PXP&algorithm=MD5')).toThrow(/algorithm/i);
  });

  it('rejects an unsupported digits value', () => {
    expect(() => parseOtpauthUri('otpauth://totp/alice?secret=JBSWY3DPEHPK3PXP&digits=7')).toThrow(/digits/i);
  });
});

describe('buildOtpauthUri', () => {
  it('round-trips through parseOtpauthUri for a totp entry with all fields', () => {
    const built = buildOtpauthUri({
      mode: 'totp',
      issuer: 'Example',
      account: 'alice@example.com',
      secret: 'JBSWY3DPEHPK3PXP',
      algorithm: 'SHA256',
      digits: 8,
      period: 60,
      counter: null,
    });
    const parsed = parseOtpauthUri(built);
    expect(parsed).toEqual({
      mode: 'totp',
      issuer: 'Example',
      account: 'alice@example.com',
      secret: 'JBSWY3DPEHPK3PXP',
      algorithm: 'SHA256',
      digits: 8,
      period: 60,
      counter: null,
    });
  });

  it('round-trips a hotp entry, carrying the counter', () => {
    const built = buildOtpauthUri({
      mode: 'hotp',
      issuer: '',
      account: 'alice',
      secret: 'JBSWY3DPEHPK3PXP',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      counter: 42,
    });
    const parsed = parseOtpauthUri(built);
    expect(parsed.mode).toBe('hotp');
    expect(parsed.counter).toBe(42);
  });

  it('omits default-valued params from the query string (algorithm=SHA1, digits=6, period=30)', () => {
    const built = buildOtpauthUri({
      mode: 'totp',
      issuer: '',
      account: 'alice',
      secret: 'JBSWY3DPEHPK3PXP',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      counter: null,
    });
    expect(built).not.toMatch(/algorithm=/);
    expect(built).not.toMatch(/digits=/);
    expect(built).not.toMatch(/period=/);
  });
});
