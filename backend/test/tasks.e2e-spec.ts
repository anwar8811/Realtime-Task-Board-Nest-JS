import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'crypto';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

/**
 * STORY-003 Test Scenarios (validation/not-found/filter only — no
 * cross-user ownership scoping here, that's STORY-004/012's job):
 * - POST /tasks missing `title` -> 400 with a field error naming "title".
 * - POST /tasks with an invalid `status` value -> 400.
 * - GET /tasks?status=done returns only `done` tasks.
 * - GET /tasks/:id with an unknown id -> 404.
 *
 * Boots the real Nest app (real PrismaModule -> real local Postgres from
 * backend/.env) and drives it over HTTP via supertest, exactly like a real
 * client would.
 */
describe('Tasks (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let accessToken: string;
  let userId: string;

  // Unique per test run so re-running the suite never collides with the
  // `email` unique constraint, without requiring manual DB cleanup between runs.
  const runId = randomUUID();
  const testEmail = `story003-${runId}@example.com`;
  const testPassword = 'CorrectHorseBattery1!';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Mirrors the global pipe registered in main.ts so this spec exercises
    // the same validation behaviour real requests get.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
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

    const dbUser = await prisma.user.findUnique({
      where: { email: testEmail },
    });
    userId = dbUser!.id;
  });

  afterAll(async () => {
    // Clean up everything this suite created so re-runs start from a known
    // state and no test data is left behind in the shared local Postgres DB.
    await prisma.task.deleteMany({ where: { ownerId: userId } });
    await prisma.user.deleteMany({ where: { email: testEmail } });
    await app.close();
  });

  function authed() {
    return request(app.getHttpServer())
      .post('/tasks')
      .set('Authorization', `Bearer ${accessToken}`);
  }

  describe('POST /tasks validation', () => {
    it('missing title -> 400 with a field error naming "title"', async () => {
      const response = await authed()
        .send({ description: 'no title here' })
        .expect(400);

      const body = response.body as { message: unknown };
      const message = JSON.stringify(body.message);
      expect(message).toEqual(expect.stringContaining('title'));
    });

    it('invalid status value -> 400', async () => {
      await authed()
        .send({ title: 'A task', status: 'not-a-real-status' })
        .expect(400);
    });
  });

  describe('GET /tasks?status= filter', () => {
    it('returns only tasks matching the given status', async () => {
      await authed().send({ title: 'todo task', status: 'todo' }).expect(201);
      await authed()
        .send({ title: 'in progress task', status: 'in_progress' })
        .expect(201);
      const doneOne = await authed()
        .send({ title: 'done task 1', status: 'done' })
        .expect(201);
      const doneTwo = await authed()
        .send({ title: 'done task 2', status: 'done' })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get('/tasks')
        .query({ status: 'done' })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const tasks = response.body as Array<{ id: string; status: string }>;
      const doneIds = [
        (doneOne.body as { id: string }).id,
        (doneTwo.body as { id: string }).id,
      ];

      expect(tasks.length).toBeGreaterThanOrEqual(2);
      expect(tasks.every((task) => task.status === 'done')).toBe(true);
      expect(tasks.map((task) => task.id)).toEqual(
        expect.arrayContaining(doneIds),
      );
    });
  });

  describe('GET /tasks/:id not found', () => {
    it('an unknown (but valid) uuid -> 404', () => {
      return request(app.getHttpServer())
        .get(`/tasks/${randomUUID()}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('owner CRUD success', () => {
    it('GET, then PATCH, then DELETE (followed by a 404 GET) all succeed for the owning user', async () => {
      const createResponse = await authed()
        .send({ title: 'owner CRUD task', description: 'original description' })
        .expect(201);

      const taskId = (createResponse.body as { id: string }).id;

      const getResponse = await request(app.getHttpServer())
        .get(`/tasks/${taskId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(getResponse.body).toMatchObject({
        id: taskId,
        title: 'owner CRUD task',
        description: 'original description',
        ownerId: userId,
      });

      const patchResponse = await request(app.getHttpServer())
        .patch(`/tasks/${taskId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'owner CRUD task (updated)' })
        .expect(200);

      expect((patchResponse.body as { title: string }).title).toBe(
        'owner CRUD task (updated)',
      );

      await request(app.getHttpServer())
        .delete(`/tasks/${taskId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/tasks/${taskId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });
});
