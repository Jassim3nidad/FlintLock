import { Buffer } from 'buffer';
import { configureTestPlatform, resetPlatformForTests } from '../../testing/configureTestPlatform';
import { unsafeKeyHandleBytesForTests } from '../../testing/nodeCryptoProvider';
import { DecryptionError, Pbkdf2Params } from '../types';
import { dekWrapAad, generateDek, generateSalt, unwrapKey, upgradeKdfParams, wrapKey } from '../envelope';
import { deriveKek } from '../kdf';

beforeEach(() => configureTestPlatform());
afterEach(() => resetPlatformForTests());

const FAST_PBKDF2: Pbkdf2Params = { kdf: 'pbkdf2', iterations: 100, digest: 'sha256' };

describe('generateDek / generateSalt', () => {
  it('produce 32-byte random values that differ across calls', async () => {
    const a = unsafeKeyHandleBytesForTests(await generateDek());
    const b = unsafeKeyHandleBytesForTests(await generateDek());
    expect(a.length).toBe(32);
    expect(a.equals(b)).toBe(false);

    const s1 = generateSalt();
    expect(s1.length).toBe(32);
  });
});

describe('wrapKey / unwrapKey — master password verification', () => {
  it('round-trips the DEK under the correct password', async () => {
    const salt = generateSalt();
    const kek = await deriveKek(Buffer.from('correct horse'), FAST_PBKDF2, salt);
    const dek = await generateDek();
    const aad = dekWrapAad('vault-1', 1);

    const wrapped = await wrapKey(dek, kek, aad);
    const unwrapped = await unwrapKey(wrapped, kek, aad);

    expect(unsafeKeyHandleBytesForTests(unwrapped).equals(unsafeKeyHandleBytesForTests(dek))).toBe(true);
  });

  it('fails closed on the wrong master password — this IS password verification, no separate hash exists', async () => {
    const salt = generateSalt();
    const dek = await generateDek();
    const aad = dekWrapAad('vault-1', 1);

    const rightKek = await deriveKek(Buffer.from('correct horse'), FAST_PBKDF2, salt);
    const wrapped = await wrapKey(dek, rightKek, aad);

    const wrongKek = await deriveKek(Buffer.from('wrong password'), FAST_PBKDF2, salt);
    await expect(unwrapKey(wrapped, wrongKek, aad)).rejects.toThrow(DecryptionError);
  });

  it('fails closed if the wrapped DEK is moved to a different vault (AAD binding)', async () => {
    const salt = generateSalt();
    const kek = await deriveKek(Buffer.from('pw'), FAST_PBKDF2, salt);
    const dek = await generateDek();

    const wrapped = await wrapKey(dek, kek, dekWrapAad('vault-1', 1));
    await expect(unwrapKey(wrapped, kek, dekWrapAad('vault-2', 1))).rejects.toThrow(DecryptionError);
  });
});

describe('upgradeKdfParams — raising KDF strength without re-encrypting vault data', () => {
  it('re-wraps the same DEK under new params, and the old wrapped blob still requires the (now stale) old params', async () => {
    const password = Buffer.from('correct horse battery staple');
    const vaultId = 'vault-1';
    const oldSalt = generateSalt();
    const oldParams: Pbkdf2Params = { kdf: 'pbkdf2', iterations: 100, digest: 'sha256' };
    const oldKek = await deriveKek(password, oldParams, oldSalt);
    const dek = await generateDek();
    const oldAad = dekWrapAad(vaultId, 1);
    const oldWrapped = await wrapKey(dek, oldKek, oldAad);

    const newParams: Pbkdf2Params = { kdf: 'pbkdf2', iterations: 200, digest: 'sha256' };
    const result = await upgradeKdfParams(password, oldWrapped, oldParams, oldSalt, oldAad, newParams, vaultId, 2);

    expect(result.kdfParams).toEqual(newParams);
    expect(result.salt.equals(oldSalt)).toBe(false);

    // Same DEK survives the upgrade — unwrap under the new envelope succeeds
    // and decrypts to the identical key that was wrapped under the old one.
    const newKek = await deriveKek(password, result.kdfParams, result.salt);
    const recoveredDek = await unwrapKey(result.wrappedDek, newKek, dekWrapAad(vaultId, 2));
    expect(unsafeKeyHandleBytesForTests(recoveredDek).equals(unsafeKeyHandleBytesForTests(dek))).toBe(true);
  });

  it('rejects the upgrade if given the wrong master password', async () => {
    const vaultId = 'vault-1';
    const oldSalt = generateSalt();
    const oldParams: Pbkdf2Params = { kdf: 'pbkdf2', iterations: 100, digest: 'sha256' };
    const oldKek = await deriveKek(Buffer.from('correct horse'), oldParams, oldSalt);
    const dek = await generateDek();
    const oldAad = dekWrapAad(vaultId, 1);
    const oldWrapped = await wrapKey(dek, oldKek, oldAad);

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
