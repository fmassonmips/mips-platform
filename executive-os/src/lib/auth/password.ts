import bcrypt from 'bcryptjs';
export const PASSWORD_MIN = 12;
export function validatePasswordPolicy(p: string): string | null {
  if (p.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters`;
  if (!/[a-z]/.test(p) || !/[A-Z]/.test(p) || !/[0-9]/.test(p)) return 'Password must contain upper-case, lower-case and digits';
  return null;
}
export async function hashPassword(p: string): Promise<string> { return bcrypt.hash(p, 12); }
export async function verifyPassword(p: string, hash: string): Promise<boolean> { return bcrypt.compare(p, hash); }
// Hash of a random string: used to equalise timing when the user does not exist.
export const DUMMY_HASH = '$2b$12$VBRFOxcIBqVm/pE5PDNbT.yhIhKP.euBXfKlaWMYfOJjJqcBlrrLO';
