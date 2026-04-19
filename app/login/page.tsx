'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clearSession, readSession, saveSession, verifyCode, type SelectedUser } from '../../lib/auth-session';

const USERS: Array<{ id: SelectedUser; label: string; subtitle: string }> = [
  { id: 'gael', label: 'Gael', subtitle: 'Manager / owner access' },
  { id: 'jeff', label: 'Jeff', subtitle: 'Admin access' },
];

export default function LoginPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<SelectedUser | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const session = useMemo(() => readSession(), []);

  useEffect(() => { if (session) router.replace('/dashboard'); }, [session, router]);

  const submit = () => {
    if (!selected) return setError('Select Gael or Jeff first.');
    if (!verifyCode(selected, code)) return setError('Invalid 6-digit code.');
    saveSession({ user: selected, code, at: Date.now() });
    router.replace('/dashboard');
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">PMS Web</h1>
          <p className="text-sm text-muted-foreground">Select the account and enter the 6-digit code.</p>
        </div>
        <div className="grid gap-3">
          {USERS.map((u) => (
            <button key={u.id} onClick={() => { setSelected(u.id); setError(''); }} className={`rounded-lg border p-4 text-left ${selected===u.id ? 'border-primary bg-primary/5' : ''}`}>
              <div className="font-medium">{u.label}</div>
              <div className="text-sm text-muted-foreground">{u.subtitle}</div>
            </button>
          ))}
        </div>
        <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0,6))} inputMode="numeric" placeholder="6-digit code" className="w-full rounded-md border px-3 py-2" />
        {error ? <p className="text-sm text-red-500">{error}</p> : null}
        <button onClick={submit} className="w-full rounded-md bg-primary px-4 py-2 text-primary-foreground">Enter PMS</button>
        <button onClick={() => { clearSession(); setCode(''); setSelected(null); }} className="w-full rounded-md border px-4 py-2">Clear session</button>
      </div>
    </main>
  );
}
