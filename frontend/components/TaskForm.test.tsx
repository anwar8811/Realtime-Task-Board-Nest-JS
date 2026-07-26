import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaskForm } from './TaskForm';
import { apiFetch } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  apiFetch: jest.fn(),
}));

const mockedApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

describe('TaskForm', () => {
  it('renders the backend field error when submitting a blank title', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        statusCode: 400,
        message: ['title should not be empty'],
      }),
    } as Response);

    render(
      <TaskForm onSuccess={() => {}} onCancel={() => {}} />,
    );

    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'title should not be empty',
    );
  });
});
