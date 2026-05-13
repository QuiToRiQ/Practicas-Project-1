import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import { PasswordService } from '../../core/security/password.service';
import {
  IRefreshTokenRepository,
} from '../../core/storage/ports/refresh-token.repository';
import { IUserRepository, UserRecord } from '../../core/storage/ports/user.repository';
import {
  REFRESH_TOKEN_REPOSITORY,
  USER_REPOSITORY,
} from '../../core/storage/ports/tokens';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  accessExpiresInSec: number;
  refreshExpiresInSec: number;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: IRefreshTokenRepository,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
    private readonly cfg: ConfigService,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async register(input: { email: string; password: string; displayName?: string }): Promise<UserRecord> {
    const email = input.email.trim().toLowerCase();
    const existing = await this.users.findByEmail(email);
    if (existing) throw new ConflictException('email already registered');
    const passwordHash = await this.passwords.hash(input.password);
    // First-time registration grants the baseline "tutor" role; an admin role
    // is seeded out-of-band. Adjust this policy when self-registration is closed.
    return this.users.create({
      email,
      passwordHash,
      displayName: input.displayName ?? null,
      roleNames: ['tutor'],
    });
  }

  async validateCredentials(email: string, password: string): Promise<UserRecord> {
    const normalized = email.trim().toLowerCase();
    const user = await this.users.findByEmail(normalized);
    // Run argon2 even on miss to keep timing roughly uniform.
    const dummy = '$argon2id$v=19$m=19456,t=2,p=1$ZmFrZWZha2VmYWtl$ZmFrZWhhc2hmYWtlaGFzaA';
    const ok = user
      ? await this.passwords.verify(user.passwordHash, password)
      : (await this.passwords.verify(dummy, password).catch(() => false), false);
    if (!user || !ok || !user.isActive) throw new UnauthorizedException('invalid credentials');
    return user;
  }

  async issueTokens(user: UserRecord): Promise<IssuedTokens> {
    const accessTtl = Number(this.cfg.getOrThrow('JWT_ACCESS_TTL'));
    const refreshTtl = Number(this.cfg.getOrThrow('JWT_REFRESH_TTL'));

    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email },
      { secret: this.cfg.getOrThrow('JWT_ACCESS_SECRET'), expiresIn: accessTtl },
    );

    const rawRefresh = randomBytes(48).toString('base64url');
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, jti: rawRefresh },
      { secret: this.cfg.getOrThrow('JWT_REFRESH_SECRET'), expiresIn: refreshTtl },
    );
    await this.refreshTokens.create({
      userId: user.id,
      tokenHash: this.hashToken(refreshToken),
      expiresAt: new Date(Date.now() + refreshTtl * 1000),
    });

    return {
      accessToken,
      refreshToken,
      accessExpiresInSec: accessTtl,
      refreshExpiresInSec: refreshTtl,
    };
  }

  async rotateRefreshToken(rawRefreshToken: string): Promise<IssuedTokens> {
    let decoded: { sub: string };
    try {
      decoded = await this.jwt.verifyAsync(rawRefreshToken, {
        secret: this.cfg.getOrThrow('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('invalid refresh token');
    }
    const stored = await this.refreshTokens.findByHash(this.hashToken(rawRefreshToken));
    if (!stored || stored.revokedAt || stored.expiresAt.getTime() < Date.now()) {
      // Reuse detection: a leaked token is being replayed — nuke the whole family.
      if (decoded?.sub) await this.refreshTokens.revokeAllForUser(decoded.sub);
      throw new UnauthorizedException('invalid refresh token');
    }
    const user = await this.users.findById(stored.userId);
    if (!user || !user.isActive) throw new UnauthorizedException();
    await this.refreshTokens.revoke(stored.id);
    return this.issueTokens(user);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.refreshTokens.revokeAllForUser(userId);
  }
}
