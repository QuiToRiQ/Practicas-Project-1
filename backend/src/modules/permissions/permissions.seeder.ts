import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PermissionEntity } from '../../core/storage.pg/entities/permission.entity';
import { RoleEntity } from '../../core/storage.pg/entities/role.entity';

/**
 * Canonical role/permission catalogue. Edit here, restart, and the rows are
 * upserted — never write seed data ad-hoc against the DB.
 */
const PERMISSIONS: Array<{ code: string; description: string }> = [
  { code: 'sheets:read', description: 'View own spreadsheets' },
  { code: 'sheets:write', description: 'Upload, edit, merge own spreadsheets' },
  { code: 'sheets:delete', description: 'Delete own spreadsheets' },
  { code: 'sheets:export', description: 'Export spreadsheets' },
  { code: 'users:admin', description: 'Manage users and roles' },
];

const ROLES: Array<{ name: string; description: string; permissions: string[] }> = [
  {
    name: 'tutor',
    description: 'Tutor managing their own student records',
    permissions: ['sheets:read', 'sheets:write', 'sheets:delete', 'sheets:export'],
  },
  {
    name: 'admin',
    description: 'Full administrative access',
    permissions: ['sheets:read', 'sheets:write', 'sheets:delete', 'sheets:export', 'users:admin'],
  },
];

@Injectable()
export class PermissionsSeeder implements OnApplicationBootstrap {
  private readonly log = new Logger(PermissionsSeeder.name);

  constructor(
    @InjectRepository(PermissionEntity) private readonly perms: Repository<PermissionEntity>,
    @InjectRepository(RoleEntity) private readonly roles: Repository<RoleEntity>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    for (const p of PERMISSIONS) {
      await this.perms.upsert({ code: p.code, description: p.description }, ['code']);
    }
    const allPerms = await this.perms.find({ where: { code: In(PERMISSIONS.map((p) => p.code)) } });
    const permByCode = new Map(allPerms.map((p) => [p.code, p]));

    for (const r of ROLES) {
      let role = await this.roles.findOne({ where: { name: r.name } });
      if (!role) role = this.roles.create({ name: r.name, description: r.description });
      role.description = r.description;
      role.permissions = r.permissions.map((c) => permByCode.get(c)!).filter(Boolean);
      await this.roles.save(role);
    }
    this.log.log(`seeded ${PERMISSIONS.length} permissions, ${ROLES.length} roles`);
  }
}
