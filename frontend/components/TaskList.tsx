import { useState } from 'react';
import type { Task } from '@/hooks/useTasks';
import type { AuthUser } from '@/lib/auth-context';

interface TaskListProps {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  currentUser: AuthUser | null;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

/**
 * Presentational only — fetching lives in useTasks (STORY-006 Technical
 * Notes). Renders exactly what it's given: no client-side re-filtering by
 * owner/role, the backend is the only access boundary. `onEdit`/`onDelete`
 * are callbacks owned by the page (app/tasks/page.tsx) — this component
 * never calls apiFetch itself.
 */
export function TaskList({
  tasks,
  loading,
  error,
  currentUser,
  onEdit,
  onDelete,
}: TaskListProps) {
  // Tracks which row (if any) is showing the "Confirm/Cancel" delete step,
  // rather than a boolean per row — only one row can be mid-confirmation at
  // a time (ruling R-007-3: inline two-step confirm, no window.confirm(),
  // no separate ConfirmDialog component).
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null,
  );

  if (loading) {
    return (
      <p role="status" className="text-sm text-black/60 dark:text-white/60">
        Loading tasks…
      </p>
    );
  }

  if (error) {
    return (
      <p role="alert" className="text-sm text-red-600">
        {error}
      </p>
    );
  }

  if (tasks.length === 0) {
    return (
      <p data-testid="empty-state" className="text-sm text-black/60 dark:text-white/60">
        No tasks yet.
      </p>
    );
  }

  const showOwnerColumn = currentUser?.role === 'admin';

  return (
    <ul className="flex flex-col gap-2">
      {tasks.map((task) => {
        // UI convenience only — gates whether Edit/Delete controls render
        // on this row. It must NOT filter which rows are rendered at all
        // (every task the backend returned is still shown above), and it
        // must never be treated as or duplicated as real authorization: the
        // actual enforcement is the backend's task-access.guard.ts /
        // taskScopeWhere (KAD-04). If this check were ever bypassed
        // client-side, the backend still 404s on non-owned tasks for a
        // `user` role.
        const canMutate =
          currentUser?.role === 'admin' || task.ownerId === currentUser?.userId;
        const isConfirmingDelete = confirmingDeleteId === task.id;

        return (
          <li
            key={task.id}
            className="flex items-center justify-between rounded border border-black/10 px-4 py-3 text-sm dark:border-white/10"
          >
            <div className="flex flex-col">
              <span className="font-medium">{task.title}</span>
              <span className="text-xs text-black/60 dark:text-white/60">
                {task.status}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {showOwnerColumn && (
                <span className="text-xs text-black/60 dark:text-white/60">
                  Owner:{' '}
                  {task.ownerId === currentUser?.userId ? (
                    'You'
                  ) : (
                    <span className="font-mono" title={task.ownerId}>
                      {task.ownerId.slice(0, 8)}
                    </span>
                  )}
                </span>
              )}

              {canMutate && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit(task)}
                    className="rounded border border-black/20 px-2 py-1 text-xs font-medium text-black/70 hover:bg-black/5 dark:border-white/20 dark:text-white/70 dark:hover:bg-white/10"
                  >
                    Edit
                  </button>

                  {isConfirmingDelete ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmingDeleteId(null);
                          onDelete(task);
                        }}
                        className="rounded border border-red-600 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-600/10"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingDeleteId(null)}
                        className="rounded border border-black/20 px-2 py-1 text-xs font-medium text-black/70 hover:bg-black/5 dark:border-white/20 dark:text-white/70 dark:hover:bg-white/10"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingDeleteId(task.id)}
                      className="rounded border border-red-600/60 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-600/10"
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
