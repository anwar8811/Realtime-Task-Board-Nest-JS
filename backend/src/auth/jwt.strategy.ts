import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload, toAuthenticatedUser } from './jwt-payload';

/**
 * Verifies the Bearer token's signature/expiry and turns the payload into
 * `request.user`. This is the ONLY place a request's identity/role comes
 * from — never trust a client-supplied id or role field instead.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET')!,
    });
  }

  validate(payload: JwtPayload) {
    return toAuthenticatedUser(payload);
  }
}
