import { execSync } from 'child_process';
import * as dotenv from 'dotenv';
import * as path from 'path';

/**
 * STORY-012: runs exactly once before the whole e2e suite (Jest's
 * `globalSetup`, wired in jest-e2e.json) to reset the dedicated test
 * database to a clean, fully-migrated state.
 *
 * This runs in its own Node process, separate from any Jest worker, so it
 * loads backend/.env.test independently rather than relying on
 * `setup-env.ts` (which only runs inside worker processes).
 *
 * `prisma migrate reset` is deliberately scoped to the test database by
 * passing DATABASE_URL through the child process's own `env` rather than
 * mutating this process's `process.env` — that way there's no chance of it
 * ever touching the dev database, however this script is invoked.
 */
export default function globalSetup(): void {
  const testEnvPath = path.resolve(__dirname, '../.env.test');
  const parsed = dotenv.config({ path: testEnvPath }).parsed;

  const databaseUrl = parsed?.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      `DATABASE_URL not found in ${testEnvPath}. Copy backend/.env.test.example to backend/.env.test and set a _test-suffixed database URL before running e2e tests.`,
    );
  }

  execSync('npx prisma migrate reset --force --skip-seed', {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
  });
}
