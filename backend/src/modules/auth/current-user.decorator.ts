import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { Request } from 'express';

export interface RequestUser {
  id: string;
  email: string;
}

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): RequestUser => {
    const req = ctx.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    if (!req.user) throw new Error('CurrentUser used without JwtAuthGuard');
    return req.user;
  },
);
