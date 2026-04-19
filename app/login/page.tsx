'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clearSession, missingCodesMessage, readSession, saveSession, verifyCode, type SelectedUser } from '../../lib/auth-session';

const USERS: Array<{ id: SelectedUser; label: string; subtitle: string; tone: string }> = [
  { id: 'jeff', label: 'Jeff', subtitle: 'Administrator', tone: 'from-emerald-700/70 to-emerald-600/50' },
  { id: 'gael', label: 'Gael', subtitle: 'Owner', tone: 'from-slate-700/80 to-indigo-700/50' },
];

export default function LoginPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<SelectedUser | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const session = useMemo(() => readSession(), []);
  const missing = useMemo(() => missingCodesMessage(), []);

  useEffect(() => { if (session) router.replace('/dashboard'); }, [session, router]);
  useEffect(() => { if (selected) inputRef.current?.focus(); }, [selected]);

  const chooseUser = (user: SelectedUser) => {
    setSelected(user);
    setError('');
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const submit = () => {
    if (!selected) return setError('Select an account first.');
    if (!verifyCode(selected, code)) return setError('Invalid 6-digit code.');
    saveSession({ user: selected, code, at: Date.now() });
    router.replace('/dashboard');
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-[300px] rounded-2xl border border-white/8 bg-[rgba(18,27,44,0.72)] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-sm">
        <div className="text-center mb-4">
          <div className="text-xl font-semibold tracking-wide">🏢 PMS OS</div>
          <div className="text-xs text-white/55">Property Management System</div>
          <div className="mt-4 text-xs text-white/45">Select account</div>
        </div>
        <div className="space-y-2">
          {USERS.map((u) => (
            <button
              key={u.id}
              onClick={() => chooseUser(u.id)}
              className={`w-full rounded-lg border px-4 py-3 text-left transition ${selected === u.id ? `border-white/20 bg-gradient-to-r ${u.tone}` : 'border-white/10 bg-white/5 hover:bg-white/8'}`}
            >
              <div className="text-sm font-semibold">{u.label}</div>
              <div className="text-[11px] text-white/60">{u.subtitle}</div>
            </button>
          ))}
        </div>
        <div className="mt-3">
          <input
            ref={inputRef}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            placeholder="000000"
            className="w-full rounded-lg border border-white/10 bg-[#0f1626] px-3 py-2 text-center text-sm tracking-[0.35em] text-white outline-none placeholder:text-white/20"
          />
        </div>
        {error ? <p className="mt-2 text-center text-xs text-red-300">{error}</p> : null}
        {missing ? <p className="mt-2 text-center text-[11px] text-amber-200/80">Set Vercel env vars: {missing}</p> : null}
        <button onClick={submit} className="mt-3 w-full rounded-lg bg-[#27445e] py-2 text-sm font-medium text-white hover:bg-[#31506b]">Login</button>
        <button onClick={() => { clearSession(); setSelected(null); setCode(''); setError(''); }} className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 py-2 text-sm text-white/75 hover:bg-white/8">Reset</button>
      </div>
    </main>
  );
}
