import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PasswordService } from '../../core/security/password.service';
import { IRefreshTokenRepository } from '../../core/storage/ports/refresh-token.repository';
import { IRoleRepository, RoleRecord } from '../../core/storage/ports/role.repository';
import { ISpreadsheetRepository } from '../../core/storage/ports/spreadsheet.repository';
import {
  REFRESH_TOKEN_REPOSITORY,
  ROLE_REPOSITORY,
  SPREADSHEET_REPOSITORY,
  USER_REPOSITORY,
} from '../../core/storage/ports/tokens';
import { IUserRepository, UserRecord } from '../../core/storage/ports/user.repository';

const ADMIN_ROLE = 'admin';

export interface AdminStats {
  userCount: number;
  activeUserCount: number;
  adminCount: number;
  sheetCount: number;
  totalRowCount: number;
}

/** Public-safe projection of a user. NEVER includes the password hash. */
export interface AdminUserDto {
  id: string;
  email: string;
  displayName: string | null;
  isActive: boolean;
  roleNames: string[];
  createdAt: Date;
}

function toAdminDto(u: UserRecord): AdminUserDto {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    isActive: u.isActive,
    roleNames: u.roleNames,
    createdAt: u.createdAt,
  };
}

@Injectable()
export class AdminService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(ROLE_REPOSITORY) private readonly roles: IRoleRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: IRefreshTokenRepository,
    @Inject(SPREADSHEET_REPOSITORY) private readonly sheets: ISpreadsheetRepository,
    private readonly passwords: PasswordService,
  ) {}

  async list(query: { search?: string; offset: number; limit: number }) {
    const page = await this.users.list(query);
    return { users: page.users.map(toAdminDto), total: page.total };
  }

  async get(id: string): Promise<AdminUserDto> {
    const u = await this.users.findById(id);
    if (!u) throw new NotFoundException('user not found');
    return toAdminDto(u);
  }

  async listRoles(): Promise<RoleRecord[]> {
    return this.roles.listAll();
  }

  async updateUser(input: {
    actingUserId: string;
    targetId: string;
    patch: { displayName?: string | null; isActive?: boolean };
  }): Promise<AdminUserDto> {
    if (input.patch.isActive === false && input.actingUserId === input.targetId) {
      throw new ForbiddenException('you cannot deactivate yourself');
    }
    const updated = await this.users.update(input.targetId, input.patch);
    // Deactivating a user must invalidate their sessions; otherwise they'd keep
    // a valid access token until it naturally expires.
    if (input.patch.isActive === false) {
      await this.refreshTokens.revokeAllForUser(input.targetId);
    }
    return toAdminDto(updated);
  }

  async setRoles(input: {
    actingUserId: string;
    targetId: string;
    roleNames: string[];
  }): Promise<AdminUserDto> {
    // Reject unknown role names up front so the DB doesn't silently drop them.
    const allRoles = await this.roles.listAll();
    const known = new Set(allRoles.map((r) => r.name));
    const unknown = input.roleNames.filter((n) => !known.has(n));
    if (unknown.length) {
      throw new BadRequestException(`unknown role(s): ${unknown.join(', ')}`);
    }

    const removingAdmin = !input.roleNames.includes(ADMIN_ROLE);

    if (removingAdmin && input.actingUserId === input.targetId) {
      throw new ForbiddenException('you cannot remove the admin role from yourself');
    }

    if (removingAdmin) {
      const target = await this.users.findById(input.targetId);
      if (target?.roleNames.includes(ADMIN_ROLE)) {
        const adminCount = await this.users.countByRole(ADMIN_ROLE);
        if (adminCount <= 1) {
          throw new ConflictException('cannot remove the last admin');
        }
      }
    }

    const updated = await this.users.setRoles(input.targetId, input.roleNames);
    return toAdminDto(updated);
  }

  async resetPassword(input: {
    actingUserId: string;
    targetId: string;
    newPassword: string;
  }): Promise<void> {
    const target = await this.users.findById(input.targetId);
    if (!target) throw new NotFoundException('user not found');
    const passwordHash = await this.passwords.hash(input.newPassword);
    await this.users.update(input.targetId, { passwordHash });
    // Always log the user out of every device after an admin reset, so they
    // can't keep using their old tokens.
    await this.refreshTokens.revokeAllForUser(input.targetId);
  }

  async forceLogout(targetId: string): Promise<void> {
    await this.refreshTokens.revokeAllForUser(targetId);
  }

  async deleteUser(input: { actingUserId: string; targetId: string }): Promise<void> {
    if (input.actingUserId === input.targetId) {
      throw new ForbiddenException('you cannot delete yourself');
    }
    const target = await this.users.findById(input.targetId);
    if (!target) throw new NotFoundException('user not found');
    if (target.roleNames.includes(ADMIN_ROLE)) {
      const adminCount = await this.users.countByRole(ADMIN_ROLE);
      if (adminCount <= 1) {
        throw new ConflictException('cannot delete the last admin');
      }
    }
    // Cascade order matters: refresh tokens → sheets/rows → user. Doing it via
    // explicit calls keeps the repositories simple (no DB-level FK cascades).
    await this.refreshTokens.revokeAllForUser(input.targetId);
    await this.sheets.deleteAllForOwner(input.targetId);
    await this.users.delete(input.targetId);
  }

  async stats(): Promise<AdminStats> {
    const [userCount, activeUserCount, adminCount, sheetCount, totalRowCount] = await Promise.all([
      this.users.count(),
      this.users.count({ isActive: true }),
      this.users.countByRole(ADMIN_ROLE),
      this.sheets.countAll(),
      this.sheets.sumRowCount(),
    ]);
    return { userCount, activeUserCount, adminCount, sheetCount, totalRowCount };
  }
}
