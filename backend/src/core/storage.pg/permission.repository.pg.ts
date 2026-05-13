import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IPermissionRepository } from '../storage/ports/permission.repository';
import { UserEntity } from './entities/user.entity';

@Injectable()
export class PermissionPgRepository implements IPermissionRepository {
  constructor(
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
  ) {}

  async listForUser(userId: string): Promise<string[]> {
    const u = await this.users.findOne({
      where: { id: userId },
      relations: { roles: { permissions: true } },
    });
    if (!u) return [];
    const codes = new Set<string>();
    for (const r of u.roles ?? []) for (const p of r.permissions ?? []) codes.add(p.code);
    return Array.from(codes);
  }
}
