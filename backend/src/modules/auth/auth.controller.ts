import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService, IssuedTokens } from './auth.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import { IPermissionRepository } from '../../core/storage/ports/permission.repository';
import { PERMISSION_REPOSITORY } from '../../core/storage/ports/tokens';

function cookieOptions(cfg: ConfigService, maxAgeSec: number) {
  return {
    httpOnly: true,
    secure: cfg.getOrThrow<string>('COOKIE_SECURE') === 'true',
    sameSite: 'lax' as const,
    domain: cfg.getOrThrow<string>('COOKIE_DOMAIN'),
    path: '/',
    maxAge: maxAgeSec * 1000,
  };
}

function setAuthCookies(res: Response, cfg: ConfigService, tokens: IssuedTokens) {
  res.cookie('access_token', tokens.accessToken, cookieOptions(cfg, tokens.accessExpiresInSec));
  res.cookie('refresh_token', tokens.refreshToken, {
    ...cookieOptions(cfg, tokens.refreshExpiresInSec),
    path: '/auth',
  });
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cfg: ConfigService,
    @Inject(PERMISSION_REPOSITORY) private readonly permissions: IPermissionRepository,
  ) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  @HttpCode(201)
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.register(dto);
    const tokens = await this.auth.issueTokens(user);
    setAuthCookies(res, this.cfg, tokens);
    return { user: { id: user.id, email: user.email, displayName: user.displayName } };
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.validateCredentials(dto.email, dto.password);
    const tokens = await this.auth.issueTokens(user);
    setAuthCookies(res, this.cfg, tokens);
    return { user: { id: user.id, email: user.email, displayName: user.displayName } };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
    const raw = cookies?.['refresh_token'];
    if (!raw) throw new UnauthorizedException();
    const tokens = await this.auth.rotateRefreshToken(raw);
    setAuthCookies(res, this.cfg, tokens);
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentUser() user: { id: string }, @Res({ passthrough: true }) res: Response) {
    await this.auth.revokeAllForUser(user.id);
    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: '/auth' });
  }

  @UseGuards(JwtAuthGuard)
  @Post('me')
  @HttpCode(200)
  async me(@CurrentUser() user: { id: string; email: string }) {
    const permissions = await this.permissions.listForUser(user.id);
    return { user: { id: user.id, email: user.email }, permissions };
  }
}
