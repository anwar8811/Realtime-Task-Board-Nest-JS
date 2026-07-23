import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'crypto';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

/**
 * STORY-002 Test Scenarios:
 * - Register -> login -> protected route succeeds with the returned token;
 *   fails (401) without it or with a tampered signature.
 * - Duplicate-email register returns 409.
 * - A token's `role` claim matches what's in the database at issuance time;
 *   a hand-edited (invalid-signature) token is rejected.
 *
 * Boots the real Nest app (real PrismaModule -> real local Postgres from
 * backend/.env) and drives it over HTTP via supertest, exactly like a real
 * client would.
 */
describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  // Unique per test run so re-running the suite never collides with the
  // `email` unique constraint, without requiring manual DB cleanup between runs.
  const runId = randomUUID();
  const testEmail = `story002-${runId}@example.com`;
  const testPassword = 'CorrectHorseBattery1!';

  const createdEmails: string[] = [testEmail];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = moduleFixture.get(PrismaService);
  });

  afterAll(async () => {
    // Clean up everything this suite created so re-runs start from a known
    // state and no test data is left behind in the shared local Postgres DB.
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await app.close();
  });

  describe('register -> login -> protected route', () => {
    it('POST /auth/register creates a new user with role=user', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: testEmail, password: testPassword })
        .expect(201);

      expect(response.body).toMatchObject({
        email: testEmail,
        role: 'user',
      });
      // Never return password_hash in any response DTO.
      const body = response.body as Record<string, unknown>;
      expect(body.passwordHash).toBeUndefined();
      expect(body.password_hash).toBeUndefined();
    });

    it('POST /auth/login returns an accessToken for the registered user', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: testEmail, password: testPassword })
        .expect(201);

      const { accessToken } = response.body as { accessToken: string };
      expect(typeof accessToken).toBe('string');
      expect(accessToken.length).toBeGreaterThan(0);
    });

    it('GET /auth/me with the returned token succeeds with {userId, role}', async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: testEmail, password: testPassword })
        .expect(201);

      const { accessToken } = loginResponse.body as { accessToken: string };

      const dbUser = await prisma.user.findUnique({
        where: { email: testEmail },
      });

      const meResponse = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(meResponse.body).toEqual({
        userId: dbUser!.id,
        role: 'user',
      });
    });

    it('GET /auth/me with no Authorization header fails with 401', () => {
      return request(app.getHttpServer()).get('/auth/me').expect(401);
    });

    it('GET /auth/me with a tampered (invalid-signature) token fails with 401', async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: testEmail, password: testPassword })
        .expect(201);

      const { accessToken } = loginResponse.body as { accessToken: string };
      const tamperedToken = tamperSignature(accessToken);

      return request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${tamperedToken}`)
        .expect(401);
    });
  });

  describe('duplicate-email register', () => {
    it('returns 409 when registering an email that already exists', async () => {
      const duplicateEmail = `story002-dup-${randomUUID()}@example.com`;
      createdEmails.push(duplicateEmail);

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: duplicateEmail, password: testPassword })
        .expect(201);

      const secondAttempt = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: duplicateEmail, password: testPassword })
        .expect(409);

      const body = secondAttempt.body as { message: unknown };
      expect(body.message).toEqual(expect.any(String));
    });
  });

  describe('role claim matches DB at issuance time', () => {
    it('a freshly registered user token decodes to role=user via /auth/me', async () => {
      const userEmail = `story002-user-${randomUUID()}@example.com`;
      createdEmails.push(userEmail);

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: userEmail, password: testPassword })
        .expect(201);

      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: userEmail, password: testPassword })
        .expect(201);

      const meResponse = await request(app.getHttpServer())
        .get('/auth/me')
        .set(
          'Authorization',
          `Bearer ${(loginResponse.body as { accessToken: string }).accessToken}`,
        )
        .expect(200);

      const body = meResponse.body as { role: string };
      expect(body.role).toBe('user');
    });

    it('the seeded admin account token decodes to role=admin via /auth/me', async () => {
      const adminEmail = process.env.ADMIN_EMAIL;
      const adminPassword = process.env.ADMIN_PASSWORD;

      if (!adminEmail || !adminPassword) {
        throw new Error(
          'ADMIN_EMAIL/ADMIN_PASSWORD must be set (see backend/.env) for this test to run against the seeded admin account.',
        );
      }

      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: adminEmail, password: adminPassword })
        .expect(201);

      const adminDbUser = await prisma.user.findUnique({
        where: { email: adminEmail },
      });
      expect(adminDbUser?.role).toBe('admin');

      const meResponse = await request(app.getHttpServer())
        .get('/auth/me')
        .set(
          'Authorization',
          `Bearer ${(loginResponse.body as { accessToken: string }).accessToken}`,
        )
        .expect(200);

      expect(meResponse.body).toEqual({
        userId: adminDbUser!.id,
        role: 'admin',
      });
    });
  });
});

/**
 * Flips characters in a JWT's signature segment (the part after the last
 * `.`) so the payload/header are untouched but the signature no longer
 * verifies against JWT_SECRET — simulating a hand-edited/forged token.
 */
function tamperSignature(token: string): string {
  const parts = token.split('.');
  const signature = parts[2];
  const flipped = signature
    .split('')
    .map((char, index) => (index % 2 === 0 ? (char === 'A' ? 'B' : 'A') : char))
    .join('');

  // Guarantee the signature actually changes even in edge cases where the
  // character-flip above happens to produce the same string back.
  const finalSignature =
    flipped === signature ? `${flipped.slice(0, -1)}X` : flipped;

  return `${parts[0]}.${parts[1]}.${finalSignature}`;
}
