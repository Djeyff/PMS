export type SelectedUser = 'gael' | 'jeff';
export type AuthSession = { user: SelectedUser; code: string; at: number };
const KEY = 'pmsweb20-session';
export const AUTH_CODES: Record<SelectedUser, string> = {
  gael: process.env.NEXT_PUBLIC_PMS_GAEL_CODE ?? '111111',
  jeff: process.env.NEXT_PUBLIC_PMS_JEFF_CODE ?? '222222',
};
export function verifyCode(user: SelectedUser, code: string) {
  return /^\d{6}$/.test(code) && code === AUTH_CODES[user];
}
export function readSession(): AuthSession | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(KEY);
  return raw ? JSON.parse(raw) as AuthSession : null;
}
export function saveSession(session: AuthSession) {
  window.localStorage.setItem(KEY, JSON.stringify(session));
}
export function clearSession() {
  window.localStorage.removeItem(KEY);
}
