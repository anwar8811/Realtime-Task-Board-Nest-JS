import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

/**
 * Creates (or updates) the single bootstrap admin account. This is the only
 * way an 'admin' user is ever created — there is no in-app "promote to
 * admin" endpoint (see STORY-002). Runs standalone via `prisma db seed`, so
 * it reads process.env directly rather than through Nest's ConfigModule.
 */
async function main() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    throw new Error(
      'Seeding the admin account requires both ADMIN_EMAIL and ADMIN_PASSWORD to be set in the environment.',
    );
  }

  const prisma = new PrismaClient();

  try {
    const passwordHash = await bcrypt.hash(adminPassword, SALT_ROUNDS);

    const admin = await prisma.user.upsert({
      where: { email: adminEmail },
      update: {},
      create: {
        email: adminEmail,
        passwordHash,
        role: UserRole.admin,
      },
    });

    console.log(`Admin account ready: ${admin.email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
