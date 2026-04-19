'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clearSession, readSession } from '../../lib/auth-session';

export default function DashboardPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const s = readSession();
    if (!s) router.replace('/login'); else setReady(true);
  }, [router]);
  if (!ready) return null;
  const session = readSession();
  return (
    <main className="p-6 space-y-4">
      <h1 className="text-3xl font-semibold">PMS Dashboard</h1>
      <p>Logged in as <b>{session?.user}</b>.</p>
      <div className="grid gap-3 md:grid-cols-3">
        <a className="rounded-lg border p-4" href="/manager-report">Manager Report</a>
        <a className="rounded-lg border p-4" href="/owner-reports">Owner Reports</a>
        <a className="rounded-lg border p-4" href="/security">Security</a>
      </div>
      <button onClick={() => { clearSession(); router.replace('/login'); }} className="rounded-md border px-4 py-2">Sign out</button>
    </main>
  );
}
