import { render, screen } from '@testing-library/react';
import { TaskList } from './TaskList';

describe('TaskList', () => {
  it('renders the empty state when there are no tasks', () => {
    render(
      <TaskList tasks={[]} loading={false} error={null} currentUser={null} />,
    );

    expect(screen.getByText('No tasks yet.')).toBeInTheDocument();
  });

  it('renders the error state instead of a blank screen', () => {
    render(
      <TaskList
        tasks={[]}
        loading={false}
        error="Failed to load tasks"
        currentUser={null}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Failed to load tasks',
    );
  });
});
