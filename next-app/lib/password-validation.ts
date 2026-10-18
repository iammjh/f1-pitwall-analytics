export const MAX_PASSWORD_BYTES = 72;
export const MIN_SIGNUP_PASSWORD_LENGTH = 6;

/** bcrypt only uses the first 72 UTF-8 bytes. Reject longer input before hashing or comparing. */
export function validatePassword(
  password: unknown,
  isSignUp = false,
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof password !== 'string' || password.length === 0) {
    return { ok: false, error: 'Email and password are required' };
  }
  if (new TextEncoder().encode(password).byteLength > MAX_PASSWORD_BYTES) {
    return {
      ok: false,
      error: `Password must be ${MAX_PASSWORD_BYTES} UTF-8 bytes or fewer; accented letters and emoji can use multiple bytes.`,
    };
  }
  if (isSignUp && password.length < MIN_SIGNUP_PASSWORD_LENGTH) {
    return { ok: false, error: `Password must be at least ${MIN_SIGNUP_PASSWORD_LENGTH} characters` };
  }
  return { ok: true, value: password };
}
