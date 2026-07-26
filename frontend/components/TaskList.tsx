import type { Task } from '@/hooks/useTasks';
import type { AuthUser } from '@/lib/auth-context';

interface TaskListProps {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  currentUser: AuthUser | null;
}

/**
 * Presentational only — fetching lives in useTasks (STORY-006 Technical
 * Notes). Renders exactly what it's given: no client-side re-filtering by
 * owner/role, the backend is the only access boundary.
 */
export function TaskList({ tasks, loading, error, currentUser }: TaskListProps) {
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
      {tasks.map((task) => (
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

          {showOwnerColumn && (
            <span className="text-xs text-black/60 dark:text-white/60">
              Owner:{' '}
              {task.ownerId === currentUser?.userId ? (
                'You'
              ) : (
                <span
                  className="font-mono"
                  title={task.ownerId}
                >
                  {task.ownerId.slice(0, 8)}
                </span>
              )}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
