import * as dotenv from 'dotenv';
import * as path from 'path';

/**
 * STORY-012: points every e2e spec at the dedicated test database (and the
 * rest of backend/.env.test) instead of the dev backend/.env.
 *
 * Registered as Jest's `setupFiles` (see jest-e2e.json) rather than
 * `globalSetup`: `setupFiles` runs inside the same worker process that then
 * requires each spec file, so this env mutation is guaranteed to happen
 * before a spec's `import { AppModule } from '../src/app.module'` triggers
 * `ConfigModule.forRoot()`. `globalSetup` runs in a separate Node process
 * whose `process.env` changes never reach the worker, so it can't be used
 * for this.
 */
dotenv.config({
  path: path.resolve(__dirname, '../.env.test'),
  override: true,
});
