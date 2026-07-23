import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

const SALT_ROUNDS = 10;

export interface RegisteredUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface AccessToken {
  accessToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Creates a new account. Role is never accepted from the caller — every
   * self-registered account is a plain 'user'. Only prisma/seed.ts can create
   * an 'admin' account (see STORY-002 acceptance criteria).
   */
  async register(email: string, password: string): Promise<RegisteredUser> {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    try {
      const user = await this.prisma.user.create({
        data: {
          email,
          passwordHash,
          role: UserRole.user,
        },
      });

      return { id: user.id, email: user.email, role: user.role };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'An account with this email already exists',
        );
      }

      throw error;
    }
  }

  /**
   * Verifies credentials and, on success, signs a JWT whose payload carries
   * the user's id and role. That payload is the only source of role/identity
   * that the rest of the app trusts on subsequent requests.
   */
  async login(email: string, password: string): Promise<AccessToken> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Generic message on purpose — never reveal whether the email or the
    // password was the one that didn't match.
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // JWT_SECRET/JWT_EXPIRES_IN are already wired into JwtService via
    // JwtModule.registerAsync in auth.module.ts — sign() only needs the payload.
    const accessToken = this.jwtService.sign({ sub: user.id, role: user.role });

    return { accessToken };
  }
}
