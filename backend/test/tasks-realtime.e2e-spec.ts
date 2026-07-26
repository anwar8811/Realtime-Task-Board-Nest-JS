import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'crypto';
import type { Server as HttpServer } from 'http';
import type { AddressInfo } from 'net';
import { io, Socket as ClientSocket } from 'socket.io-client';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';

/**
 * STORY-008 Test Scenarios:
 * - Connecting without a token is rejected.
 * - Two sockets (one per user) + one admin socket: creating `userA`'s task
 *   emits to `user:<userA>` and `admin`, but not to `user:<userB>`.
 * - Deleting a task emits `task.deleted` with just the id to the same
 *   scoped rooms.
 *
 * `app.init()` alone doesn't open a listening port, so this suite calls
 * `app.listen(0)` (OS-assigned free port) and reads the real port back off
 * the underlying HTTP server, then points socket.io-client at it directly
 * — exactly like a real browser client would connect.
 */
describe('Tasks realtime (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let baseUrl: string;

  const runId = randomUUID();
  const testPassword = 'CorrectHorseBattery1!';
  const userAEmail = `story008-usera-${runId}@example.com`;
  const userBEmail = `story008-userb-${runId}@example.com`;
  const adminEmail = `story008-admin-${runId}@example.com`;

  let userAId: string;
  let userBId: string;
  let adminId: string;
  let userAToken: string;
  let userBToken: string;
  let adminToken: string;

  let createdTaskId: string | undefined;

  const openSockets: ClientSocket[] = [];

  function openSocket(token?: string): ClientSocket {
    const socket = io(baseUrl, {
      auth: token ? { token } : {},
      reconnection: false,
      forceNew: true,
      timeout: 2000,
    });
    openSockets.push(socket);
    return socket;
  }

  function connectSocket(token: string): Promise<ClientSocket> {
    return new Promise((resolve, reject) => {
      const socket = openSocket(token);
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', (error: Error) => reject(error));
    });
  }

  /**
   * A rejected handshake here surfaces either as a `connect_error` (typical
   * when Socket.io's own middleware rejects it) or as a `connect` event
   * immediately followed by a `disconnect` (what actually happens with
   * this gateway: `handleConnection` runs after the transport-level
   * handshake succeeds, and calls `client.disconnect(true)` once JWT
   * verification fails). Either way, the socket must never end up in a
   * lasting connected state.
   */
  function expectConnectionRejected(token?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = openSocket(token);

      const timer = setTimeout(() => {
        reject(
          new Error(
            'Expected connect_error or connect+disconnect, got neither',
          ),
        );
      }, 2000);

      socket.once('connect_error', () => {
        clearTimeout(timer);
        resolve();
      });

      socket.once('connect', () => {
        socket.once('disconnect', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    });
  }

  function onceEvent<T = unknown>(
    socket: ClientSocket,
    event: string,
    timeoutMs = 2000,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timed out waiting for "${event}"`));
      }, timeoutMs);
      socket.once(event, (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
  }

  function expectNoEvent(
    socket: ClientSocket,
    event: string,
    waitMs = 400,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const handler = () => {
        clearTimeout(timer);
        reject(new Error(`Received unexpected "${event}" event`));
      };
      socket.once(event, handler);
      const timer = setTimeout(() => {
        socket.off(event, handler);
        resolve();
      }, waitMs);
    });
  }

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
    await app.listen(0);

    const address = (
      app.getHttpServer() as HttpServer
    ).address() as AddressInfo;
    baseUrl = `http://localhost:${address.port}`;

    prisma = moduleFixture.get(PrismaService);

    // --- User A: register + login, regular `user` role ---
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: userAEmail, password: testPassword })
      .expect(201);
    const userARecord = await prisma.user.findUnique({
      where: { email: userAEmail },
    });
    userAId = userARecord!.id;
    const userALogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: userAEmail, password: testPassword })
      .expect(201);
    userAToken = (userALogin.body as { accessToken: string }).accessToken;

    // --- User B: register + login, regular `user` role ---
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: userBEmail, password: testPassword })
      .expect(201);
    const userBRecord = await prisma.user.findUnique({
      where: { email: userBEmail },
    });
    userBId = userBRecord!.id;
    const userBLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: userBEmail, password: testPassword })
      .expect(201);
    userBToken = (userBLogin.body as { accessToken: string }).accessToken;

    // --- Admin: promote to admin BEFORE login, so the JWT actually
    // carries role: admin (same pattern as tasks-rbac.e2e-spec.ts) ---
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: adminEmail, password: testPassword })
      .expect(201);
    const adminRecord = await prisma.user.findUnique({
      where: { email: adminEmail },
    });
    adminId = adminRecord!.id;
    await prisma.user.update({
      where: { id: adminId },
      data: { role: 'admin' },
    });
    const adminLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminEmail, password: testPassword })
      .expect(201);
    adminToken = (adminLogin.body as { accessToken: string }).accessToken;
  });

  afterAll(async () => {
    // Wait for each client socket to actually confirm its disconnect
    // (rather than just firing `.disconnect()` and moving on) so the
    // underlying engine.io transport/timers are torn down before this
    // suite closes the Nest app out from under them — otherwise Jest can
    // warn about a worker process failing to exit gracefully.
    await Promise.all(
      openSockets.map(
        (socket) =>
          new Promise<void>((resolve) => {
            if (socket.disconnected) {
              resolve();
              return;
            }
            socket.once('disconnect', () => resolve());
            socket.disconnect();
          }),
      ),
    );

    if (createdTaskId) {
      await prisma.task.deleteMany({ where: { id: createdTaskId } });
    }
    await prisma.task.deleteMany({
      where: { ownerId: { in: [userAId, userBId, adminId] } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [userAEmail, userBEmail, adminEmail] } },
    });
    await app.close();
  });

  describe('connection handshake auth', () => {
    it('rejects a connection with no token', async () => {
      await expectConnectionRejected(undefined);
    });

    it('rejects a connection with a garbage/invalid token', async () => {
      await expectConnectionRejected('this-is-not-a-valid-jwt');
    });
  });

  describe('scoped emission (create/delete)', () => {
    let userASocket: ClientSocket;
    let userBSocket: ClientSocket;
    let adminSocket: ClientSocket;

    beforeAll(async () => {
      [userASocket, userBSocket, adminSocket] = await Promise.all([
        connectSocket(userAToken),
        connectSocket(userBToken),
        connectSocket(adminToken),
      ]);
    });

    it("creating userA's task emits `task.created` to userA and admin, but not to userB", async () => {
      const userACreated = onceEvent<{
        id: string;
        ownerId: string;
        title: string;
      }>(userASocket, 'task.created');
      const adminCreated = onceEvent<{
        id: string;
        ownerId: string;
        title: string;
      }>(adminSocket, 'task.created');
      const userBSilent = expectNoEvent(userBSocket, 'task.created');

      const createResponse = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ title: "userA's realtime task" })
        .expect(201);
      createdTaskId = (createResponse.body as { id: string }).id;

      const [userAPayload, adminPayload] = await Promise.all([
        userACreated,
        adminCreated,
        userBSilent,
      ]);

      expect(userAPayload.id).toBe(createdTaskId);
      expect(userAPayload.ownerId).toBe(userAId);
      expect(userAPayload.title).toBe("userA's realtime task");
      expect(adminPayload).toEqual(userAPayload);
    });

    it("deleting userA's task emits `task.deleted` with just {id} to userA and admin, but not to userB", async () => {
      const userADeleted = onceEvent<{ id: string }>(
        userASocket,
        'task.deleted',
      );
      const adminDeleted = onceEvent<{ id: string }>(
        adminSocket,
        'task.deleted',
      );
      const userBSilent = expectNoEvent(userBSocket, 'task.deleted');

      await request(app.getHttpServer())
        .delete(`/tasks/${createdTaskId}`)
        .set('Authorization', `Bearer ${userAToken}`)
        .expect(200);

      const [userAPayload, adminPayload] = await Promise.all([
        userADeleted,
        adminDeleted,
        userBSilent,
      ]);

      expect(userAPayload).toEqual({ id: createdTaskId });
      expect(Object.keys(userAPayload)).toEqual(['id']);
      expect(adminPayload).toEqual({ id: createdTaskId });

      // Already deleted via the REST call above; afterAll's cleanup query
      // is then a harmless no-op for this id.
      createdTaskId = undefined;
    });
  });
});
