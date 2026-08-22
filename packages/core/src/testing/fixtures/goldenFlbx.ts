import { VaultRecord } from '../../storage/schema';

/**
 * Fixed inputs for the golden .flbx cross-platform fixture — see
 * goldenFlbxCheck.ts. Low PBKDF2 iteration count deliberately: this
 * fixture exists to catch format drift, not to model a real vault's KDF
 * cost.
 */
export const GOLDEN_FLBX_MASTER_PASSWORD = 'correct horse battery staple';
export const GOLDEN_FLBX_KDF_PARAMS = { kdf: 'pbkdf2' as const, iterations: 1000, digest: 'sha256' as const };

export const GOLDEN_FLBX_RECORDS: VaultRecord[] = [
  {
    id: 'golden-credential-1',
    recordType: 'credential',
    title: 'Example Bank',
    username: 'alice@example.com',
    password: 'Tr0ub4dor&3-example-only',
    urls: ['https://bank.example.com'],
    notes: 'Fixture record — not a real credential.',
    tagIds: ['golden-tag-1'],
    customFields: [{ key: 'Account number', value: '000123456789', type: 'hidden' }],
    favorite: true,
    passwordHistory: [{ password: 'old-password-example', changedAt: 1700000000000 }],
    createdAt: 1700000000000,
    updatedAt: 1700000100000,
    passwordUpdatedAt: 1700000100000,
    lastUsedAt: 1700000200000,
    deletedAt: null,
  },
  {
    id: 'golden-totp-1',
    recordType: 'totp',
    credentialId: 'golden-credential-1',
    issuer: 'Example Bank',
    account: 'alice@example.com',
    secret: 'JBSWY3DPEHPK3PXP',
    algorithm: 'SHA1',
    digits: 6,
    mode: 'totp',
    period: 30,
    counter: null,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    deletedAt: null,
  },
  {
    id: 'golden-tag-1',
    recordType: 'tag',
    name: 'Finance',
    color: '#4287f5',
  },
];

/**
 * Base64-encoded .flbx bytes, generated once via encodeFlbx() with the
 * inputs above and checked in verbatim. Regenerate only by deliberate,
 * reviewed action (see the generator note in goldenFlbxCheck.ts) — this
 * string being stable across commits is the entire point of the fixture.
 */
export const GOLDEN_FLBX_BASE64 =
  'RkxCWAEAAAByeyJrZGYiOnsia2RmIjoicGJrZGYyIiwiaXRlcmF0aW9ucyI6MTAwMCwiZGlnZXN0Ijoic2hhMjU2In0sInNhbHQiOiIvcnNlNlNBUFF5S2hycHA0MThaWlZYWkhDcHpZZ2FFc2oxTHJyUWw3ZTFFPSJ93Hpyroe4Dk5WgIs1JVfc3DCx/vIzVnTUIKGVbfp4eiIXOoJoc6Z9NR5scC2g8KR3yrkAkYxCmGY6xc7b1e+PO9PMiu1Qifcbkx0y3OSDlaiGZLxKa6pWzeAHlN/6aJ5kaB716Fl/l7+4ApayRXlHwxtOzU6Wc2opKFrbO/7Y4wIG2Omx7I98GYW7EqreiVfwuMme1FOggue4VM87gCsNzv9eFhYAkmMo0UByi7zySZ+Cht38gYLJ162DXxPWF8UW8Wn3uvVi9x0p6mLuIFf2bhcBrMqaw6vMCAvZyM7OIzg8bnM9jqJWOob0ZbJ/PQmjMZmllK4lW306h2o8MMEpfRpmIiIiqvRdeMBv8ywEwUiQeZZaY2NpmUONxJSzwJmtLXewdq40d3EJZBi/jWKG8WMCAZ0P3c6Xt0Vv0+UIL4CE0ASqiPDoCFbPz/FvV1e1d453cwvM/vgD+5mhDH8Y2rlOhg6bH3n02DUJDIFo1evZMYF4EEvdniSFQs7W/jnuTkz9ykDFlP8+VOdOYsdYXrCRjiGc2sPZISNeeeZxc2yGSneZYN5WE88ZB0SwQLj9FUzeTFUj7m7KIV5scMkxS4ywLP1mndqCjs72UXadhcCW7gP7nz3Bm2oiamFYWJYEZZwEM9Okt59C3i0glE3/yyOYmoWHR29QcMi+Y4QqWA+ZCa96Kl3OaC10pvpbP3Nss5LwsQ05BYlrt9Dqs80XLsl8PEcsZx2zoSUF2hmvL6MDE8JQehvUUrlryDLLT/sxMAo/oT3gwfWTCeMZVTdmOFPeODMkz4OD+MPrLRkzO7okDAi83Hlzkf9iQglJzbb1/xxzHYyhbA15kvZL9KW40bwSJgeSP7li26nV3yISw8pIQaBt5j10Dj4Y/jpwc5dy0cvxBPttY+yfrSpWq3z3coBhmxxsy+JxikaCEmbsUu+h8Pr1clqCiJcgJSddbSu+sT69XlhtrrdeUAnWjsvAmKXeDGVDapW5VkgBYupcS+Wg+9D8bM17MGB1tChcO+lMHVG3INUcgoNzfIHNvE5uup+f/DQg82LrbZ9WeBVFo0DFaq6dKwEim1ht0Do4wT6wBzaCMgoCVOQzVMdn3IDmxkzXsEV5HStUn/VfBdgZQXaYE+WH+V5n505eR3YXcOqU4rN9yiUHDgeP8lweJ61uYhOzzX2jkoap7V1uZysMzGNcHYfsnCFTHvTFx1PNAAv3Dde2rBxA0lAwfMZqMqoKyRH/ITcEOQJIoLvlUqNhGtRM1nE5r6zFAiLkINK/pOdqzwa++wvrWghXTSVqQYxA2GN0DpxWAmQcKd3x1WUFXzaO2PF3nNnH2qqpfHqjSvXCcc0a+/TKr5mB+aQ34Q170ntJNMtqUcbAnUQfWM43OedkawJJ2KanL6a6NeBTSZI=';
