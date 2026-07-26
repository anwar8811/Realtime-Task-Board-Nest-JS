'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, type AuthUser } from '@/lib/auth-context';
import { useTasks } from '@/hooks/useTasks';
import { StatusFilter } from '@/components/StatusFilter';
import { TaskList } from '@/components/TaskList';

export default function TasksPage() {
  const router = useRouter();
  const { token, loading, user } = useAuth();

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

  // Split into a child component so useTasks (and any future STORY-007/009
  // hooks) is only ever called once the auth guard above has passed —
  // calling it unconditionally in this component would violate the Rules of
  // Hooks given the early return above.
  return <TasksPageContent user={user} />;
}

function TasksPageContent({ user }: { user: AuthUser | null }) {
  const { tasks, loading, error, status, setStatus } = useTasks();

  return (
    <main className="flex flex-1 flex-col px-4 py-8 max-w-2xl w-full mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Tasks</h1>
      <StatusFilter value={status} onChange={setStatus} />
      <TaskList tasks={tasks} loading={loading} error={error} currentUser={user} />
    </main>
  );
}
