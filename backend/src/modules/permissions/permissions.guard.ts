import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IPermissionRepository } from '../../core/storage/ports/permission.repository';
import { PERMISSION_REPOSITORY } from '../../core/storage/ports/tokens';
import { PERMISSIONS_KEY } from './permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(PERMISSION_REPOSITORY) private readonly permissions: IPermissionRepository,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(
      PERMISSIONS_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: { id: string } }>();
    if (!req.user) throw new ForbiddenException();
    const granted = new Set(await this.permissions.listForUser(req.user.id));
    const missing = required.filter((p) => !granted.has(p));
    if (missing.length) {
      throw new ForbiddenException({ message: 'missing permissions', missing });
    }
    return true;
  }
}
