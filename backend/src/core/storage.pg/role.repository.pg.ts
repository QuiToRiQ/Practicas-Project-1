import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IRoleRepository, RoleRecord } from '../storage/ports/role.repository';
import { RoleEntity } from './entities/role.entity';

@Injectable()
export class RolePgRepository implements IRoleRepository {
  constructor(
    @InjectRepository(RoleEntity) private readonly roles: Repository<RoleEntity>,
  ) {}

  async listAll(): Promise<RoleRecord[]> {
    const rows = await this.roles.find({ order: { name: 'ASC' } });
    return rows.map((r) => ({
      name: r.name,
      description: r.description,
      permissionCodes: (r.permissions ?? []).map((p) => p.code).sort(),
    }));
  }
}
