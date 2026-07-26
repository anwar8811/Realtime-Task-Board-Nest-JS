'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';

/**
 * The frontend's own copy of the Task shape, matching what the backend
 * returns from GET /tasks. No shared types package exists between
 * frontend/backend (see folder-structure.md) — this file is the single
 * place the frontend's Task type lives, and STORY-007/009 should import
 * it from here rather than redeclaring it.
 */
export type TaskStatus = 'todo' | 'in_progress' | 'done';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

interface UseTasksResult {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
  status: TaskStatus | undefined;
  setStatus: (status: TaskStatus | undefined) => void;
}

/**
 * Single source of truth for the rendered task list (see folder-structure.md
 * conventions). Owns the status filter itself (architect ruling) and fetches
 * GET /tasks[?status=] via the shared apiFetch wrapper. STORY-009's
 * useTaskSocket will dispatch into this hook's state rather than keeping a
 * second, parallel list — so `refetch` is kept as a stable useCallback
 * reference other effects can safely depend on.
 */
export function useTasks(initialStatus?: TaskStatus): UseTasksResult {
  const [status, setStatus] = useState<TaskStatus | undefined>(initialStatus);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Monotonically increasing request id. Guards against an in-flight
  // request's response overwriting a newer one when the filter is toggled
  // quickly (e.g. todo -> done fires two requests; if "todo"'s response
  // arrives after "done"'s, it must be discarded).
  const requestIdRef = useRef(0);

  const fetchTasks = useCallback(() => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    const path = status ? `/tasks?status=${status}` : '/tasks';

    apiFetch(path)
      .then(async (response) => {
        if (requestId !== requestIdRef.current) return; // stale, ignore

        if (!response.ok) {
          let message = 'Failed to load tasks';
          try {
            const body: { message?: string } = await response.json();
            if (typeof body.message === 'string') {
              message = body.message;
            }
          } catch {
            // keep generic message
          }
          setTasks([]);
          setError(message);
          return;
        }

        const data: Task[] = await response.json();
        setTasks(data);
      })
      .catch(() => {
        if (requestId !== requestIdRef.current) return;
        setTasks([]);
        setError('Failed to load tasks');
      })
      .finally(() => {
        if (requestId !== requestIdRef.current) return;
        setLoading(false);
      });
  }, [status]);

  useEffect(() => {
    // Re-fetch whenever `status` changes (fetchTasks is recreated when it
    // does). This is the "synchronize with an external system" case
    // useEffect exists for — GET /tasks is fetched fresh whenever the
    // status filter changes — same justification as the localStorage read
    // in lib/auth-context.tsx. The linter can't see that setLoading/setError
    // inside fetchTasks are conditioned on a fresh request id, so it flags
    // this as a plain synchronous setState-in-effect; it isn't one.
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    fetchTasks();
  }, [fetchTasks]);

  return { tasks, loading, error, refetch: fetchTasks, status, setStatus };
}
