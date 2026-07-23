'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function TasksPage() {
  const router = useRouter();
  const { token, loading } = useAuth();

  useEffect(() => {
    // Wait for the auth context to finish reading localStorage before
    // deciding to bounce — otherwise every hard refresh would briefly
    // redirect an already-logged-in user back to /login.
    if (loading) return;
    if (!token) {
      router.replace('/login');
    }
  }, [loading, token, router]);

  if (loading || !token) {
    return null;
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-semibold">Tasks</h1>
      <p className="mt-2 text-sm text-black/60 dark:text-white/60">
        Task list coming soon (STORY-006/007).
      </p>
    </main>
  );
}
