export type SelectedUser = 'gael' | 'jeff';
export type AuthSession = { user: SelectedUser; code: string; at: number };
const KEY = 'pmsweb20-session';
const resolveCode = (name: string) => process.env[`NEXT_PUBLIC_${name}`] ?? process.env[name] ?? '';
export const AUTH_CODES: Record<SelectedUser, string> = {
  gael: resolveCode('PMS_GAEL_CODE'),
  jeff: resolveCode('PMS_JEFF_CODE'),
};
export function verifyCode(user: SelectedUser, code: string) {
  const normalized = code.replace(/\s+/g, '');
  return /^\d{6}$/.test(normalized) && AUTH_CODES[user].length === 6 && normalized === AUTH_CODES[user];
}
export function missingCodesMessage() {
  return [
    !AUTH_CODES.gael ? 'PMS_GAEL_CODE' : null,
    !AUTH_CODES.jeff ? 'PMS_JEFF_CODE' : null,
  ].filter(Boolean).join(', ');
}
export function readSession(): AuthSession | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as AuthSession) : null;
}
export function saveSession(session: AuthSession) {
  window.localStorage.setItem(KEY, JSON.stringify(session));
}
export function clearSession() {
  window.localStorage.removeItem(KEY);
}
