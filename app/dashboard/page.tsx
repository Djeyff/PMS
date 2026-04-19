'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clearSession, readSession } from '../../lib/auth-session';

export default function DashboardPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const s = readSession();
    if (!s) router.replace('/login');
    else setReady(true);
  }, [router]);

  if (!ready) return null;
  const session = readSession();

  return (
    <main className="min-h-screen p-6 text-white">
      <div className="mx-auto max-w-4xl space-y-4 rounded-3xl border border-white/10 bg-[rgba(18,27,44,0.72)] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-sm">
        <div>
          <h1 className="text-3xl font-semibold">PMS Dashboard</h1>
          <p className="text-sm text-white/70">Logged in as <b className="capitalize">{session?.user}</b>.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Link className="rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10" href="/manager-report">Manager Report</Link>
          <Link className="rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10" href="/owner-reports">Owner Reports</Link>
          <Link className="rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10" href="/security">Security</Link>
        </div>
        <button onClick={() => { clearSession(); router.replace('/login'); }} className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10">Sign out</button>
      </div>
    </main>
  );
}
