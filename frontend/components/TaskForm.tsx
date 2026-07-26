'use client';

import { useState, type FormEvent } from 'react';
import { apiFetch } from '@/lib/api';
import type { Task, TaskStatus } from '@/hooks/useTasks';

const STATUS_OPTIONS: { label: string; value: TaskStatus }[] = [
  { label: 'Todo', value: 'todo' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Done', value: 'done' },
];

interface TaskFormProps {
  /** Presence selects edit mode (PATCH /tasks/:id); absence selects create mode (POST /tasks). */
  task?: Task;
  onSuccess: () => void;
  onCancel: () => void;
}

/**
 * Shared create/edit form (folder-structure.md: TaskForm.tsx hosts both, and
 * is where STORY-011's "AI Summarise" button attaches to `description`).
 *
 * This component never calls refetch() and never mutates any list state
 * itself (architect ruling R-007-5) — it only performs the mutation and, on
 * success, calls `onSuccess()`. The caller (app/tasks/page.tsx) owns
 * refetching the list and closing the form.
 */
export function TaskForm({ task, onSuccess, onCancel }: TaskFormProps) {
  const isEdit = Boolean(task);

  const [title, setTitle] = useState(task?.title ?? '');
  // Plain useState<string>, not derived from FormData, so STORY-011's AI
  // Summarise button can later call setDescription(...) programmatically.
  const [description, setDescription] = useState(task?.description ?? '');
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? 'todo');

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors([]);
    setSubmitting(true);

    try {
      const response = await apiFetch(
        isEdit ? `/tasks/${task!.id}` : '/tasks',
        {
          method: isEdit ? 'PATCH' : 'POST',
          // `description` is always sent as-is, even when empty, so
          // clearing it on edit actually clears it in the DB rather than
          // being omitted/ignored (ruling R-007-6).
          body: JSON.stringify({ title, description, status }),
        },
      );

      if (!response.ok) {
        let messages: string[] = ['Something went wrong. Please try again.'];
        try {
          const body: { message?: string | string[] } = await response.json();
          if (Array.isArray(body.message)) {
            messages = body.message;
          } else if (typeof body.message === 'string') {
            messages = [body.message];
          }
        } catch {
          // keep the generic fallback message
        }
        setErrors(messages);
        return;
      }

      onSuccess();
    } catch {
      setErrors(['Something went wrong. Please try again.']);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full rounded-lg border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black"
    >
      <h2 className="mb-4 text-lg font-semibold">
        {isEdit ? 'Edit task' : 'New task'}
      </h2>

      <label htmlFor="title" className="mb-1 block text-sm font-medium">
        Title
      </label>
      <input
        id="title"
        name="title"
        type="text"
        // Deliberately no `required` attribute: Test Scenario 1 requires the
        // BACKEND's 400 validation error to actually fire and render for a
        // blank title. A native `required` attribute would block submission
        // client-side before any request is sent, so the server-validation
        // path (and its rendered error message) would never be exercised.
        // No other client-side pre-flight blocking (e.g. disabling submit
        // when blank) is added for the same reason.
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="mb-4 w-full rounded border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-black"
      />

      <label htmlFor="description" className="mb-1 block text-sm font-medium">
        Description
      </label>
      <textarea
        id="description"
        name="description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={4}
        className="mb-4 w-full rounded border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-black"
      />

      <label htmlFor="status" className="mb-1 block text-sm font-medium">
        Status
      </label>
      <select
        id="status"
        name="status"
        value={status}
        onChange={(e) => setStatus(e.target.value as TaskStatus)}
        className="mb-4 w-full rounded border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-black"
      >
        {STATUS_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {errors.length > 0 && (
        <div role="alert" className="mb-4 text-sm text-red-600">
          <ul className="list-inside list-disc">
            {errors.map((message, index) => (
              <li key={index}>{message}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-60"
        >
          {submitting ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded border border-black/20 px-4 py-2 text-sm font-medium text-black/70 disabled:opacity-60 dark:border-white/20 dark:text-white/70"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
