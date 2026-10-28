/* Password rules for new passwords (sign-up, reset, change). Shared by the browser and the server. */

const COMMON = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890', 'qwerty123', 'qwertyuiop', 'iloveyou',
  'admin123', 'admin@123', 'welcome1', 'welcome123', 'abc12345', 'abcd1234', 'india123', 'india@123', 'letmein1',
  'p@ssw0rd', 'passw0rd', 'test1234', 'monkey123', '11111111', '00000000', 'acadexmatch', 'faculty123', 'professor1',
]);

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

/** Returns an error message, or null when the password is acceptable. */
export function passwordProblem(password: string, context: { email?: string; name?: string } = {}): string | null {
  const p = String(password || '');
  if (p.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (p.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) return 'Use both letters and numbers.';
  if (new Set(p).size < 5) return 'This password repeats too many characters.';
  const low = p.toLowerCase();
  if (COMMON.has(low) || COMMON.has(low.replace(/[^a-z0-9@]/g, ''))) return 'This password is too common. Choose another one.';
  const local = (context.email || '').split('@')[0]?.toLowerCase();
  if (local && local.length >= 4 && low.includes(local)) return 'Do not use your email address in the password.';
  return null;
}

/** 0–4 strength for the meter on forms (advice only; the rules above decide). */
export function passwordStrength(password: string): number {
  const p = String(password || '');
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
  if (/[0-9]/.test(p) && /[^A-Za-z0-9]/.test(p)) s++;
  return Math.min(4, s);
}
