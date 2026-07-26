import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../tasks/task-access.guard';

/**
 * The shape of the signed JWT payload (see `auth.service.ts`'s sign() call):
 * `sub` is the user's id, `role` is the Prisma `UserRole` enum value at
 * issuance time. Both REST's `JwtStrategy.validate` and the Socket.io
 * gateway's handshake verification (`tasks.gateway.ts`) decode this same
 * payload shape, so it's defined once here rather than duplicated.
 */
export interface JwtPayload {
  sub: string;
  role: UserRole;
}

/**
 * Maps a verified JWT payload to the `AuthenticatedUser` shape shared by
 * every task route/gateway event (task-access.guard.ts). This is the ONLY
 * place a payload becomes an identity — never build `AuthenticatedUser` any
 * other way.
 */
export function toAuthenticatedUser(payload: JwtPayload): AuthenticatedUser {
  return { userId: payload.sub, role: payload.role };
}
