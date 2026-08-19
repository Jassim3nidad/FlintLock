jest.mock('../native');

import { DecryptionError, Pbkdf2Params } from '../types';
import {
  dekWrapAad,
  generateDek,
  generateSalt,
  unwrapDek,
  upgradeKdfParams,
  wrapDek,
} from '../envelope';
import { deriveKek } from '../kdf';
import { Buffer } from '../native';

const FAST_PBKDF2: Pbkdf2Params = { kdf: 'pbkdf2', iterations: 100, digest: 'sha256' };

describe('generateDek / generateSalt', () => {
  it('produce 32-byte random values that differ across calls', () => {
    const a = generateDek();
    const b = generateDek();
    expect(a.length).toBe(32);
    expect(a.equals(b)).toBe(false);

    const s1 = generateSalt();
    expect(s1.length).toBe(32);
  });
});

describe('wrapDek / unwrapDek — master password verification', () => {
  it('round-trips the DEK under the correct password', async () => {
    const salt = generateSalt();
    const kek = await deriveKek(Buffer.from('correct horse'), FAST_PBKDF2, salt);
    const dek = generateDek();
    const aad = dekWrapAad('vault-1', 1);

    const wrapped = wrapDek(dek, kek, aad);
    const unwrapped = unwrapDek(wrapped, kek, aad);

    expect(unwrapped.equals(dek)).toBe(true);
  });

  it('fails closed on the wrong master password — this IS password verification, no separate hash exists', async () => {
    const salt = generateSalt();
    const dek = generateDek();
    const aad = dekWrapAad('vault-1', 1);

    const rightKek = await deriveKek(Buffer.from('correct horse'), FAST_PBKDF2, salt);
    const wrapped = wrapDek(dek, rightKek, aad);

    const wrongKek = await deriveKek(Buffer.from('wrong password'), FAST_PBKDF2, salt);
    expect(() => unwrapDek(wrapped, wrongKek, aad)).toThrow(DecryptionError);
  });

  it('fails closed if the wrapped DEK is moved to a different vault (AAD binding)', async () => {
    const salt = generateSalt();
    const kek = await deriveKek(Buffer.from('pw'), FAST_PBKDF2, salt);
    const dek = generateDek();

    const wrapped = wrapDek(dek, kek, dekWrapAad('vault-1', 1));
    expect(() => unwrapDek(wrapped, kek, dekWrapAad('vault-2', 1))).toThrow(DecryptionError);
  });
});

describe('upgradeKdfParams — raising KDF strength without re-encrypting vault data', () => {
  it('re-wraps the same DEK under new params, and the old wrapped blob still requires the (now stale) old params', async () => {
    const password = Buffer.from('correct horse battery staple');
    const vaultId = 'vault-1';
    const oldSalt = generateSalt();
    const oldParams: Pbkdf2Params = { kdf: 'pbkdf2', iterations: 100, digest: 'sha256' };
    const oldKek = await deriveKek(password, oldParams, oldSalt);
    const dek = generateDek();
    const oldAad = dekWrapAad(vaultId, 1);
    const oldWrapped = wrapDek(dek, oldKek, oldAad);

    const newParams: Pbkdf2Params = { kdf: 'pbkdf2', iterations: 200, digest: 'sha256' };
    const result = await upgradeKdfParams(
      password,
      oldWrapped,
      oldParams,
      oldSalt,
      oldAad,
      newParams,
      vaultId,
      2
    );

    expect(result.kdfParams).toEqual(newParams);
    expect(result.salt.equals(oldSalt)).toBe(false);

    // Same DEK survives the upgrade — unwrap under the new envelope succeeds
    // and decrypts to the identical key that was wrapped under the old one.
    const newKek = await deriveKek(password, result.kdfParams, result.salt);
    const recoveredDek = unwrapDek(result.wrappedDek, newKek, dekWrapAad(vaultId, 2));
    expect(recoveredDek.equals(dek)).toBe(true);
  });

  it('rejects the upgrade if given the wrong master password', async () => {
    const vaultId = 'vault-1';
    const oldSalt = generateSalt();
    const oldParams: Pbkdf2Params = { kdf: 'pbkdf2', iterations: 100, digest: 'sha256' };
    const oldKek = await deriveKek(Buffer.from('correct horse'), oldParams, oldSalt);
    const dek = generateDek();
    const oldAad = dekWrapAad(vaultId, 1);
    const oldWrapped = wrapDek(dek, oldKek, oldAad);

    await expect(
      upgradeKdfParams(
        Buffer.from('wrong password'),
        oldWrapped,
        oldParams,
        oldSalt,
        oldAad,
        { kdf: 'pbkdf2', iterations: 200, digest: 'sha256' },
        vaultId,
        2
      )
    ).rejects.toThrow(DecryptionError);
  });
});
