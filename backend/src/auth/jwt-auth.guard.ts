import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Thin wrapper around Passport's 'jwt' strategy so routes/gateways can just
 * write `@UseGuards(JwtAuthGuard)` without knowing the strategy name string.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
