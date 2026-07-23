import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from './page';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockLogin = jest.fn();
jest.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    token: null,
    login: mockLogin,
    logout: jest.fn(),
    loading: false,
  }),
}));

describe('LoginPage', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockLogin.mockClear();
    window.localStorage.clear();
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Unauthorized' }),
    }) as unknown as typeof fetch;
  });

  it('shows an inline error on 401 and does not log in or store a token', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText(/email/i), 'wrong@example.com');
    await user.type(screen.getByLabelText(/password/i), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Invalid email or password',
      );
    });

    expect(mockLogin).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('accessToken')).toBeNull();
  });
});
