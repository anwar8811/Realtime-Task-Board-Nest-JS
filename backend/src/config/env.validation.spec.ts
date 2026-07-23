import 'reflect-metadata';
import { validate } from './env.validation';

/**
 * STORY-001 Test Scenario: "App fails to boot with a clear error if
 * DATABASE_URL is missing or unreachable."
 *
 * We can't simulate "unreachable" at this unit level (that's a runtime
 * connection concern handled by PrismaService.onModuleInit, see
 * src/prisma/prisma.service.ts), but "missing" is exactly what the
 * ConfigModule's `validate` fail-fast hook covers, and this is the layer
 * responsible for making boot fail with a clear error rather than a
 * silent crash or a failure deferred to first request.
 */
describe('env.validation validate()', () => {
  it('throws a clear error when DATABASE_URL is missing', () => {
    expect.assertions(3);

    expect(() => validate({ PORT: 3000, NODE_ENV: 'test' })).toThrow(/DATABASE_URL/);

    try {
      validate({ PORT: 3000, NODE_ENV: 'test' });
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('DATABASE_URL');
      expect(message.toLowerCase()).toContain('failed');
    }
  });

  it('throws when DATABASE_URL is present but empty', () => {
    expect(() =>
      validate({ DATABASE_URL: '', PORT: 3000, NODE_ENV: 'test' }),
    ).toThrow(/DATABASE_URL/);
  });

  it('passes validation and applies defaults when DATABASE_URL is present', () => {
    const result = validate({
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/realtime_task_board?schema=public',
    });

    expect(result.DATABASE_URL).toBe(
      'postgresql://postgres:postgres@localhost:5432/realtime_task_board?schema=public',
    );
    // Defaults kick in when not supplied.
    expect(result.PORT).toBe(3000);
    expect(result.NODE_ENV).toBe('development');
  });

  it('rejects an out-of-range PORT even when DATABASE_URL is valid', () => {
    expect(() =>
      validate({
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/db',
        PORT: 70000,
      }),
    ).toThrow();
  });
});
