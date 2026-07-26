import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'crypto';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';

/**
 * STORY-010 Test Scenarios:
 * - Valid title -> 200 `{ description: <non-empty string> }` (OpenRouter
 *   call is stubbed here — a real call is done manually once against the
 *   live API per the Story's Definition of Done, not in the automated suite).
 * - Missing/blank title -> 400 naming "title".
 * - No Authorization header -> 401.
 * - Simulated OpenRouter timeout/5xx -> clean 502/504, not a crash.
 *
 * `global.fetch` is stubbed for the whole file so no real network call to
 * OpenRouter ever happens in the automated test suite.
 *
 * Boots the real Nest app (real PrismaModule -> real local Postgres from
 * backend/.env) and drives it over HTTP via supertest, exactly like a real
 * client would.
 */
describe('AI summarize (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let accessToken: string;

  const runId = randomUUID();
  const testEmail = `story010-${runId}@example.com`;
  const testPassword = 'CorrectHorseBattery1!';

  // A fake key value used only to assert it never leaks into a response
  // body — the real key (if any) lives in the gitignored .env and is never
  // asserted against here.
  const FAKE_KEY_SUBSTRING = 'sk-or-v1-fake-test-key-should-never-leak';

  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    prisma = moduleFixture.get(PrismaService);

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: testEmail, password: testPassword })
      .expect(201);

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: testEmail, password: testPassword })
      .expect(201);

    accessToken = (loginResponse.body as { accessToken: string }).accessToken;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: testEmail } });
    await app.close();
  });

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  function authedPost() {
    return request(app.getHttpServer())
      .post('/tasks/summarize')
      .set('Authorization', `Bearer ${accessToken}`);
  }

  function stubSuccess(content: string) {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        choices: [{ message: { content } }],
      }),
      text: jest.fn().mockResolvedValue(''),
    } as unknown as Response);
  }

  function stubHttpError(status: number) {
    fetchSpy.mockResolvedValue({
      ok: false,
      status,
      json: jest.fn().mockResolvedValue({ error: `upstream ${status}` }),
      text: jest.fn().mockResolvedValue(`upstream ${status}`),
    } as unknown as Response);
  }

  function stubAbort() {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    fetchSpy.mockRejectedValue(abortError);
  }

  describe('valid request', () => {
    it('valid title -> 200 with a non-empty description (stubbed OpenRouter success)', async () => {
      stubSuccess('A concise generated description.');

      const response = await authedPost()
        .send({ title: 'Fix the login bug' })
        .expect(200);

      const body = response.body as { description: string };
      expect(typeof body.description).toBe('string');
      expect(body.description.length).toBeGreaterThan(0);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('validation', () => {
    it('missing title -> 400 naming "title"', async () => {
      const response = await authedPost().send({}).expect(400);
      const message = JSON.stringify(
        (response.body as { message: unknown }).message,
      );
      expect(message).toEqual(expect.stringContaining('title'));
    });

    it('empty string title -> 400 naming "title"', async () => {
      const response = await authedPost().send({ title: '' }).expect(400);
      const message = JSON.stringify(
        (response.body as { message: unknown }).message,
      );
      expect(message).toEqual(expect.stringContaining('title'));
    });

    it('whitespace-only title -> 400 naming "title"', async () => {
      const response = await authedPost().send({ title: '   ' }).expect(400);
      const message = JSON.stringify(
        (response.body as { message: unknown }).message,
      );
      expect(message).toEqual(expect.stringContaining('title'));
    });
  });

  describe('authentication', () => {
    it('no Authorization header -> 401', () => {
      return request(app.getHttpServer())
        .post('/tasks/summarize')
        .send({ title: 'Fix the login bug' })
        .expect(401);
    });
  });

  describe('upstream failure mapping', () => {
    it('stubbed fetch timeout (AbortError) -> 504', async () => {
      stubAbort();

      const response = await authedPost()
        .send({ title: 'Fix the login bug' })
        .expect(504);

      expect(JSON.stringify(response.body)).not.toContain('AbortError');
    });

    it('stubbed fetch 503 -> 502 with a clean message, not a stack trace', async () => {
      stubHttpError(503);

      const response = await authedPost()
        .send({ title: 'Fix the login bug' })
        .expect(502);

      const text = JSON.stringify(response.body);
      expect(text).not.toContain('upstream 503');
      expect(text).not.toContain('at ');
      expect(text).not.toContain('.ts:');
    });
  });

  describe('no secret leakage', () => {
    it('never returns the API-key-shaped string or a stack trace in any response body', async () => {
      stubHttpError(500);

      const response = await authedPost()
        .send({ title: 'Fix the login bug' })
        .expect(502);

      const text = JSON.stringify(response.body);
      expect(text).not.toContain('sk-');
      expect(text).not.toContain(FAKE_KEY_SUBSTRING);
      expect(text).not.toContain('at Object.<anonymous>');
    });
  });
});
