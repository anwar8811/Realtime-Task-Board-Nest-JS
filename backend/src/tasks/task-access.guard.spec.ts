import { UserRole } from '@prisma/client';
import { taskScopeWhere } from './task-access.guard';

describe('taskScopeWhere', () => {
  it("returns `{}` (unscoped, sees everything) for an 'admin' user", () => {
    const where = taskScopeWhere({ userId: 'admin-1', role: UserRole.admin });

    expect(where).toEqual({});
  });

  it("returns `{ ownerId: user.userId }` for a regular 'user'", () => {
    const where = taskScopeWhere({ userId: 'user-1', role: UserRole.user });

    expect(where).toEqual({ ownerId: 'user-1' });
  });
});
