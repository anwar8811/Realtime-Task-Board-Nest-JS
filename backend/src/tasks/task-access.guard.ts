import { UserRole } from '@prisma/client';

/**
 * The identity shape every task route/gateway event gets from the verified
 * JWT (`request.user` — see `JwtStrategy.validate`). Never build this from a
 * client-supplied body/query field.
 */
export interface AuthenticatedUser {
  userId: string;
  role: UserRole;
}

/**
 * The single, shared "admin sees all, user sees own" scoping rule (KAD-04).
 *
 * This is a plain function rather than a Nest `CanActivate` guard class:
 * it doesn't decide allow/deny, it produces a Prisma `where` fragment that
 * `TasksService` merges into every query (`findMany`/`findFirstOrThrow`/
 * `update`/`delete`), so the scoping happens in the query itself instead of
 * fetch-all-then-filter-in-JS. STORY-008's Socket.io gateway reuses this
 * exact function for room/event scoping, so keep it here and don't
 * duplicate the `role === 'admin' ? ... : ...` check anywhere else.
 */
export function taskScopeWhere(user: AuthenticatedUser): { ownerId?: string } {
  return user.role === UserRole.admin ? {} : { ownerId: user.userId };
}
