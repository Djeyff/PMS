'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { readSession } from '../lib/auth-session';

export default function Page() {
  const router = useRouter();
  useEffect(() => { router.replace(readSession() ? '/dashboard' : '/login'); }, [router]);
  return null;
}
