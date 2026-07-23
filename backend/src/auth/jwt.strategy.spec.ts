import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import { JwtStrategy } from './jwt.strategy';

/**
 * STORY-002 Test Scenario: "A token's `role` claim matches what's in the
 * database at issuance time; a hand-edited (invalid-signature) token is
 * rejected."
 *
 * Passport's JwtStrategy only ever calls validate() AFTER it has verified the
 * token's signature/expiry against JWT_SECRET (see passport-jwt internals
 * wired up in the constructor). So this unit test's job is narrower and
 * exact: prove validate() maps the verified payload to request.user without
 * adding, dropping, or mutating any field — meaning the role a client
 * ultimately gets in request.user is exactly the role that was embedded in
 * the token at sign() time (auth.service.ts), and nothing forgeable from
 * elsewhere. Rejection of tampered/invalid-signature tokens is proven
 * end-to-end in test/auth.e2e-spec.ts, since that's a property of the
 * strategy's Passport-level verification, not of validate() itself.
 */
describe('JwtStrategy', () => {
  const buildStrategy = () => {
    const configService = {
      get: jest.fn().mockReturnValue('test-secret'),
    } as unknown as ConfigService;

    return new JwtStrategy(configService);
  };

  it('returns exactly {userId, role} derived from the verified payload, unchanged', () => {
    const strategy = buildStrategy();

    const payload = { sub: 'user-uuid-123', role: UserRole.user };
    const result = strategy.validate(payload);

    expect(result).toEqual({ userId: 'user-uuid-123', role: UserRole.user });
  });

  it('preserves an admin role claim exactly as issued', () => {
    const strategy = buildStrategy();

    const payload = { sub: 'admin-uuid-456', role: UserRole.admin };
    const result = strategy.validate(payload);

    expect(result).toEqual({ userId: 'admin-uuid-456', role: UserRole.admin });
  });

  it('does not add extra fields or leak the raw payload shape', () => {
    const strategy = buildStrategy();

    const payload = { sub: 'user-uuid-789', role: UserRole.user };
    const result = strategy.validate(payload);

    expect(Object.keys(result).sort()).toEqual(['role', 'userId']);
  });
});
