import { describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { validatePassword } from './password-validation';

describe('bcrypt password validation', () => {
  it('accepts exactly 72 bytes and rejects distinct passwords with a truncated common prefix', () => {
    expect(validatePassword('a'.repeat(72), true).ok).toBe(true);
    for (const suffix of ['first-password', 'other-password']) {
      expect(validatePassword('a'.repeat(72) + suffix, true).ok).toBe(false);
      expect(validatePassword('a'.repeat(72) + suffix, false).ok).toBe(false);
    }
  });
  it('counts UTF-8 bytes for accented letters and emoji', () => {
    expect(validatePassword('é'.repeat(36), true).ok).toBe(true);
    expect(validatePassword('é'.repeat(37), true).ok).toBe(false);
    expect(validatePassword('🏎'.repeat(18), true).ok).toBe(true);
    expect(validatePassword('🏎'.repeat(19), true).ok).toBe(false);
  });
  it('preserves compatible existing bcrypt hashes without trimming passwords', async () => {
    const password = ' existing password ';
    const result = validatePassword(password);
    expect(result).toEqual({ ok: true, value: password });
    expect(await bcrypt.compare(password, await bcrypt.hash(password, 4))).toBe(true);
    expect(validatePassword('short', true).ok).toBe(false);
  });
});
