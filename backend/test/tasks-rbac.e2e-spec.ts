import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'crypto';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';

/**
 * STORY-004 Test Scenarios — the two-user/admin scoping matrix, which is
 * this Story's own Definition-of-Done test:
 * - `user` A lists only its own task; `admin` B (promoted before login, so
 *   the JWT actually carries `role: admin`) lists both tasks.
 * - `user` A attempting GET/PATCH/DELETE on B's task id -> 404, no data leak.
 * - `admin` B can GET/PATCH/DELETE A's task successfully.
 * - A 400 (validation) and a 404 (not-found) body share the same
 *   `{ statusCode, message }` shape (global exception filter).
 *
 * Boots the real Nest app (real PrismaModule -> real local Postgres from
 * backend/.env) and drives it over HTTP via supertest, exactly like a real
 * client would.
 */
describe('Tasks RBAC (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const runId = randomUUID();
  const testPassword = 'CorrectHorseBattery1!';

  const userEmail = `story004-user-${runId}@example.com`;
  const adminEmail = `story004-admin-${runId}@example.com`;

  let userId: string;
  let adminId: string;
  let userToken: string;
  let adminToken: string;
  let userTaskId: string;
  let adminTaskId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Mirrors main.ts's global setup so this spec exercises the same
    // validation/error-shape behaviour real requests get.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    prisma = moduleFixture.get(PrismaService);

    // --- User A: register + login, regular `user` role ---
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: userEmail, password: testPassword })
      .expect(201);

    const userDbRecord = await prisma.user.findUnique({
      where: { email: userEmail },
    });
    userId = userDbRecord!.id;

    const userLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: userEmail, password: testPassword })
      .expect(201);
    userToken = (userLogin.body as { accessToken: string }).accessToken;

    // --- User B: register, promote to admin BEFORE login (so the issued
    // JWT actually carries role: admin), then log in ---
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: adminEmail, password: testPassword })
      .expect(201);

    const adminDbRecord = await prisma.user.findUnique({
      where: { email: adminEmail },
    });
    adminId = adminDbRecord!.id;

    await prisma.user.update({
      where: { id: adminId },
      data: { role: 'admin' },
    });

    const adminLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminEmail, password: testPassword })
      .expect(201);
    adminToken = (adminLogin.body as { accessToken: string }).accessToken;

    // --- One task owned by each user ---
    const userTaskResponse = await request(app.getHttpServer())
      .post('/tasks')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ title: "user A's task" })
      .expect(201);
    userTaskId = (userTaskResponse.body as { id: string }).id;

    const adminTaskResponse = await request(app.getHttpServer())
      .post('/tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: "admin B's task" })
      .expect(201);
    adminTaskId = (adminTaskResponse.body as { id: string }).id;
  });

  afterAll(async () => {
    await prisma.task.deleteMany({
      where: { ownerId: { in: [userId, adminId] } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [userEmail, adminEmail] } },
    });
    await app.close();
  });

  describe('GET /tasks scoping', () => {
    it('a `user` request returns only its own task(s)', async () => {
      const response = await request(app.getHttpServer())
        .get('/tasks')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      const tasks = response.body as Array<{ id: string; ownerId: string }>;
      expect(tasks.length).toBeGreaterThanOrEqual(1);
      expect(tasks.every((task) => task.ownerId === userId)).toBe(true);
      expect(tasks.map((task) => task.id)).toContain(userTaskId);
      expect(tasks.map((task) => task.id)).not.toContain(adminTaskId);
    });

    it('an `admin` request returns tasks from every user, including both seeded tasks', async () => {
      const response = await request(app.getHttpServer())
        .get('/tasks')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const tasks = response.body as Array<{ id: string }>;
      const taskIds = tasks.map((task) => task.id);
      expect(taskIds).toEqual(
        expect.arrayContaining([userTaskId, adminTaskId]),
      );
    });
  });

  describe('cross-owner access as a `user`', () => {
    it("GET /tasks/:id on another user's task -> 404, no data leak", async () => {
      const response = await request(app.getHttpServer())
        .get(`/tasks/${adminTaskId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(404);

      // Note: the 404 message may echo back the *id the caller already
      // requested* (it's in the URL) — that's not a data leak. What must
      // never appear is any of the task's actual field data (title, etc.).
      const body = JSON.stringify(response.body);
      expect(body).not.toContain("admin B's task");
    });

    it("PATCH /tasks/:id on another user's task -> 404, no data leak, and the task is left unchanged", async () => {
      const response = await request(app.getHttpServer())
        .patch(`/tasks/${adminTaskId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: 'hijacked title' })
        .expect(404);

      const body = JSON.stringify(response.body);
      expect(body).not.toContain("admin B's task");
      expect(body).not.toContain('hijacked title');

      const stillIntact = await prisma.task.findUnique({
        where: { id: adminTaskId },
      });
      expect(stillIntact?.title).toBe("admin B's task");
    });

    it("DELETE /tasks/:id on another user's task -> 404, no data leak, and the task still exists", async () => {
      const response = await request(app.getHttpServer())
        .delete(`/tasks/${adminTaskId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(404);

      const body = JSON.stringify(response.body);
      expect(body).not.toContain("admin B's task");

      const stillExists = await prisma.task.findUnique({
        where: { id: adminTaskId },
      });
      expect(stillExists).not.toBeNull();
    });
  });

  describe('admin can access any task', () => {
    it("admin GET /tasks/:id on user A's task succeeds", async () => {
      const response = await request(app.getHttpServer())
        .get(`/tasks/${userTaskId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect((response.body as { id: string }).id).toBe(userTaskId);
    });

    it("admin PATCH /tasks/:id on user A's task succeeds", async () => {
      const response = await request(app.getHttpServer())
        .patch(`/tasks/${userTaskId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: "user A's task (edited by admin)" })
        .expect(200);

      expect((response.body as { title: string }).title).toBe(
        "user A's task (edited by admin)",
      );
    });

    it("admin DELETE /tasks/:id on user A's task succeeds", async () => {
      // Create a disposable task owned by user A so this test doesn't
      // interfere with the shared `userTaskId` used by other tests.
      const disposableTask = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: "user A's disposable task" })
        .expect(201);
      const disposableTaskId = (disposableTask.body as { id: string }).id;

      await request(app.getHttpServer())
        .delete(`/tasks/${disposableTaskId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const deleted = await prisma.task.findUnique({
        where: { id: disposableTaskId },
      });
      expect(deleted).toBeNull();
    });
  });

  describe('error shape consistency (Test Scenario 3)', () => {
    it('a 400 validation error and a 404 not-found error share the same `{ statusCode, message }` shape', async () => {
      const validationResponse = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ description: 'missing title' })
        .expect(400);

      const notFoundResponse = await request(app.getHttpServer())
        .get(`/tasks/${randomUUID()}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(404);

      for (const response of [validationResponse, notFoundResponse]) {
        const body = response.body as Record<string, unknown>;
        expect(typeof body.statusCode).toBe('number');
        expect(
          typeof body.message === 'string' || Array.isArray(body.message),
        ).toBe(true);
      }

      expect(
        (validationResponse.body as { statusCode: number }).statusCode,
      ).toBe(400);
      expect((notFoundResponse.body as { statusCode: number }).statusCode).toBe(
        404,
      );
    });
  });
});
