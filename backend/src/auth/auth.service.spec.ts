import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;
  let prisma: { user: { create: jest.Mock; findUnique: jest.Mock } };
  let jwtService: { sign: jest.Mock };

  beforeEach(() => {
    prisma = {
      user: {
        create: jest.fn(),
        findUnique: jest.fn(),
      },
    };
    jwtService = {
      sign: jest.fn().mockReturnValue('signed.jwt.token'),
    };

    service = new AuthService(
      prisma as unknown as PrismaService,
      jwtService as unknown as JwtService,
    );

    jest.clearAllMocks();
  });

  describe('register', () => {
    it('hashes the password with bcrypt and creates the user with role=user', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
      prisma.user.create.mockResolvedValue({
        id: 'new-user-id',
        email: 'new@example.com',
        role: UserRole.user,
      });

      const result = await service.register('new@example.com', 'plaintext-pw');

      expect(bcrypt.hash).toHaveBeenCalledWith('plaintext-pw', 10);
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'new@example.com',
          passwordHash: 'hashed-password',
          role: UserRole.user,
        },
      });
      expect(result).toEqual({
        id: 'new-user-id',
        email: 'new@example.com',
        role: UserRole.user,
      });
    });

    it('translates a Prisma P2002 unique-constraint violation into a 409 ConflictException', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
      prisma.user.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.register('dup@example.com', 'plaintext-pw'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rethrows unrelated errors instead of swallowing them as a conflict', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
      const unrelatedError = new Error('connection refused');
      prisma.user.create.mockRejectedValue(unrelatedError);

      await expect(
        service.register('someone@example.com', 'plaintext-pw'),
      ).rejects.toBe(unrelatedError);
    });
  });

  describe('login', () => {
    it('signs a JWT with {sub, role} from the DB user on valid credentials', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-id-1',
        email: 'user@example.com',
        passwordHash: 'hashed-password',
        role: UserRole.user,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login('user@example.com', 'correct-pw');

      expect(bcrypt.compare).toHaveBeenCalledWith(
        'correct-pw',
        'hashed-password',
      );
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: 'user-id-1',
        role: UserRole.user,
      });
      expect(result).toEqual({ accessToken: 'signed.jwt.token' });
    });

    it('throws 401 UnauthorizedException when the email does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login('nobody@example.com', 'whatever'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(jwtService.sign).not.toHaveBeenCalled();
    });

    it('throws 401 UnauthorizedException when the password does not match', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-id-1',
        email: 'user@example.com',
        passwordHash: 'hashed-password',
        role: UserRole.user,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login('user@example.com', 'wrong-pw'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(jwtService.sign).not.toHaveBeenCalled();
    });
  });
});
