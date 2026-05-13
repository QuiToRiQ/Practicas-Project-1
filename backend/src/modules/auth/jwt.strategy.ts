import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';

export interface JwtPayload {
  sub: string;
  email: string;
  /** ISO timestamp of token issuance for audit. */
  iat?: number;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  permissions: string[];
}

function fromCookie(req: Request): string | null {
  const raw = (req as Request & { cookies?: Record<string, string> }).cookies?.['access_token'];
  return raw && typeof raw === 'string' ? raw : null;
}

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(cfg: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([fromCookie, ExtractJwt.fromAuthHeaderAsBearerToken()]),
      ignoreExpiration: false,
      secretOrKey: cfg.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<{ id: string; email: string }> {
    if (!payload?.sub || !payload?.email) throw new UnauthorizedException();
    return { id: payload.sub, email: payload.email };
  }
}
