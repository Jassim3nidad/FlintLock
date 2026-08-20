jest.mock('../native');

import { Buffer } from '../native';
import { hkdf } from '../hkdf';

describe('hkdf', () => {
  const key = Buffer.alloc(32, 0x11);
  const salt = Buffer.alloc(16, 0x22);
  const info = Buffer.from('context-info', 'utf8');

  it('returns the requested length and is deterministic', () => {
    const a = hkdf('sha256', key, salt, info, 32);
    const b = hkdf('sha256', key, salt, info, 32);
    expect(a.length).toBe(32);
    expect(a.equals(b)).toBe(true);
  });

  it('differs when the salt, info, or key changes', () => {
    const base = hkdf('sha256', key, salt, info, 32);
    expect(base.equals(hkdf('sha256', key, Buffer.alloc(16, 0x33), info, 32))).toBe(false);
    expect(base.equals(hkdf('sha256', key, salt, Buffer.from('other'), 32))).toBe(false);
    expect(base.equals(hkdf('sha256', Buffer.alloc(32, 0x99), salt, info, 32))).toBe(false);
  });

  it('supports sha512 and arbitrary output lengths', () => {
    const out = hkdf('sha512', key, salt, info, 64);
    expect(out.length).toBe(64);
  });
});
