import type { Role } from "@/contexts/AuthProvider";

export type PmsAccountId = "gael" | "jeff";

export type PmsAccount = {
  id: PmsAccountId;
  label: string;
  subtitle: string;
  role: Role;
  profileId: string;
  agencyId: string;
  firstName: string;
  lastName: string | null;
  email: string;
};

export type PmsSession = {
  account: PmsAccountId;
  at: number;
};

const STORAGE_KEY = "pms-web-session";
const CODE_LENGTH = 4;

const env = import.meta.env as Record<string, string | undefined>;

export const PMS_ACCOUNTS: Record<PmsAccountId, PmsAccount> = {
  jeff: {
    id: "jeff",
    label: "Jeff",
    subtitle: "Administrator",
    role: "agency_admin",
    profileId: "8907aab9-6c9f-4f9c-9458-afdc8106e880",
    agencyId: "0f3e8026-f3be-4f10-a1d8-334c71a642a2",
    firstName: "Jeffrey",
    lastName: "Hubert",
    email: "jeff@pms.local",
  },
  gael: {
    id: "gael",
    label: "Gael",
    subtitle: "Owner",
    role: "owner",
    profileId: "01c9965b-d0bc-4ec9-9c87-b740fadcef99",
    agencyId: "0f3e8026-f3be-4f10-a1d8-334c71a642a2",
    firstName: "Gael",
    lastName: null,
    email: "gael@pms.local",
  },
};

function readEnv(...keys: string[]) {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) return value;
  }
  return "";
}

function configuredCode(account: PmsAccountId) {
  const upper = account.toUpperCase();
  return readEnv(`VITE_PMS_${upper}_CODE`, `NEXT_PUBLIC_PMS_${upper}_CODE`);
}

export function normalizePmsCode(value: string) {
  return value.replace(/\D/g, "").slice(0, CODE_LENGTH);
}

export function getPmsCodeLength() {
  return CODE_LENGTH;
}

export function verifyPmsCode(account: PmsAccountId, code: string) {
  const expected = normalizePmsCode(configuredCode(account));
  return expected.length === CODE_LENGTH && normalizePmsCode(code) === expected;
}

export function missingPmsCodeConfig() {
  return (Object.keys(PMS_ACCOUNTS) as PmsAccountId[])
    .filter((account) => normalizePmsCode(configuredCode(account)).length !== CODE_LENGTH)
    .map((account) => `VITE_PMS_${account.toUpperCase()}_CODE`);
}

export function getPmsAuthEmail(account: PmsAccountId) {
  const upper = account.toUpperCase();
  return readEnv(`VITE_PMS_${upper}_EMAIL`, `NEXT_PUBLIC_PMS_${upper}_EMAIL`) || PMS_ACCOUNTS[account].email;
}

export function readPmsSession(): PmsSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PmsSession;
    if (!parsed?.account || !(parsed.account in PMS_ACCOUNTS)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function savePmsSession(session: PmsSession) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  window.dispatchEvent(new Event("pms-session-change"));
}

export function clearPmsSession() {
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event("pms-session-change"));
}
