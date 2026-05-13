import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, RequestUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermissions } from '../permissions/permissions.decorator';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { AdminService } from './admin.service';
import {
  AdminResetPasswordDto,
  ListUsersQueryDto,
  SetRolesDto,
  UpdateUserDto,
} from './dto/admin.dto';

/** Every route on this controller requires the `users:admin` permission. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('users:admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('stats')
  stats() {
    return this.admin.stats();
  }

  @Get('roles')
  roles() {
    return this.admin.listRoles();
  }

  @Get('users')
  listUsers(@Query() query: ListUsersQueryDto) {
    return this.admin.list({
      search: query.search,
      offset: query.offset ?? 0,
      limit: Math.min(query.limit ?? 50, 200),
    });
  }

  @Get('users/:id')
  getUser(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.admin.get(id);
  }

  @Patch('users/:id')
  updateUser(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.admin.updateUser({ actingUserId: actor.id, targetId: id, patch: dto });
  }

  @Patch('users/:id/roles')
  setRoles(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SetRolesDto,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.admin.setRoles({
      actingUserId: actor.id,
      targetId: id,
      roleNames: dto.roleNames,
    });
  }

  @Post('users/:id/password')
  @HttpCode(204)
  async resetPassword(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AdminResetPasswordDto,
    @CurrentUser() actor: RequestUser,
  ) {
    await this.admin.resetPassword({
      actingUserId: actor.id,
      targetId: id,
      newPassword: dto.password,
    });
  }

  @Post('users/:id/revoke-sessions')
  @HttpCode(204)
  async forceLogout(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.admin.forceLogout(id);
  }

  @Delete('users/:id')
  @HttpCode(204)
  async deleteUser(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() actor: RequestUser,
  ) {
    await this.admin.deleteUser({ actingUserId: actor.id, targetId: id });
  }
}
