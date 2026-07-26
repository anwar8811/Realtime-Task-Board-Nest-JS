'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { useAuth, type AuthUser } from '@/lib/auth-context';
import { useTasks, type Task } from '@/hooks/useTasks';
import { StatusFilter } from '@/components/StatusFilter';
import { TaskList } from '@/components/TaskList';
import { TaskForm } from '@/components/TaskForm';

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

// Discriminated union for which form (if any) is showing inline on the
// page — rendered inline, no modal library, no separate route/dialog
// component (ruling R-007-1).
type FormState = { mode: 'create' } | { mode: 'edit'; task: Task } | null;

function TasksPageContent({ user }: { user: AuthUser | null }) {
  const { tasks, loading, error, refetch, status, setStatus } = useTasks();
  const [formState, setFormState] = useState<FormState>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function handleFormSuccess() {
    refetch();
    setFormState(null);
  }

  async function handleDelete(task: Task) {
    setDeleteError(null);
    try {
      const response = await apiFetch(`/tasks/${task.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        setDeleteError('Failed to delete task. Please try again.');
        return;
      }

      refetch();
    } catch {
      setDeleteError('Failed to delete task. Please try again.');
    }
  }

  return (
    <main className="flex flex-1 flex-col px-4 py-8 max-w-2xl w-full mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Tasks</h1>
        <button
          type="button"
          onClick={() => setFormState({ mode: 'create' })}
          className="rounded bg-foreground px-4 py-2 text-sm font-medium text-background"
        >
          New Task
        </button>
      </div>

      {formState && (
        <div className="mb-6">
          <TaskForm
            // Key forces a full remount when switching between create/edit
            // or between two different tasks, so TaskForm's internal field
            // state never leaks stale values from a previous task
            // (ruling R-007-1).
            key={formState.mode === 'edit' ? formState.task.id : 'new'}
            task={formState.mode === 'edit' ? formState.task : undefined}
            onSuccess={handleFormSuccess}
            onCancel={() => setFormState(null)}
          />
        </div>
      )}

      {deleteError && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {deleteError}
        </p>
      )}

      <StatusFilter value={status} onChange={setStatus} />
      <TaskList
        tasks={tasks}
        loading={loading}
        error={error}
        currentUser={user}
        onEdit={(task) => setFormState({ mode: 'edit', task })}
        onDelete={handleDelete}
      />
    </main>
  );
}
