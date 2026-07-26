'use client';

import type { TaskStatus } from '@/hooks/useTasks';

interface StatusFilterOption {
  label: string;
  value: TaskStatus | undefined;
}

const OPTIONS: StatusFilterOption[] = [
  { label: 'All', value: undefined },
  { label: 'Todo', value: 'todo' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Done', value: 'done' },
];

interface StatusFilterProps {
  value: TaskStatus | undefined;
  onChange: (status: TaskStatus | undefined) => void;
}

/**
 * Controlled status filter. "All" reports `undefined` to the caller so
 * useTasks sends no `status` query param at all (not `status=all`, which
 * the backend's ParseEnumPipe would reject with a 400).
 */
export function StatusFilter({ value, onChange }: StatusFilterProps) {
  return (
    <div role="tablist" aria-label="Filter tasks by status" className="mb-4 flex gap-2">
      {OPTIONS.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.label}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(option.value)}
            className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-foreground text-background'
                : 'border border-black/20 text-black/70 hover:bg-black/5 dark:border-white/20 dark:text-white/70 dark:hover:bg-white/10'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
