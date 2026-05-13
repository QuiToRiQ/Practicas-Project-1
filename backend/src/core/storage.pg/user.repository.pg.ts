import { NotFoundException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, In, Repository } from 'typeorm';
import {
  CreateUserInput,
  IUserRepository,
  ListUsersQuery,
  UpdateUserInput,
  UserRecord,
} from '../storage/ports/user.repository';
import { RoleEntity } from './entities/role.entity';
import { UserEntity } from './entities/user.entity';

function toRecord(u: UserEntity): UserRecord {
  return {
    id: u.id,
    email: u.email,
    passwordHash: u.passwordHash,
    displayName: u.displayName,
    isActive: u.isActive,
    roleNames: (u.roles ?? []).map((r) => r.name),
    createdAt: u.createdAt,
  };
}

@Injectable()
export class UserPgRepository implements IUserRepository {
  constructor(
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    @InjectRepository(RoleEntity) private readonly roles: Repository<RoleEntity>,
  ) {}

  async findByEmail(email: string): Promise<UserRecord | null> {
    const u = await this.users.findOne({ where: { email } });
    return u ? toRecord(u) : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const u = await this.users.findOne({ where: { id } });
    return u ? toRecord(u) : null;
  }

  async create(input: CreateUserInput): Promise<UserRecord> {
    const roles = input.roleNames.length
      ? await this.roles.find({ where: { name: In(input.roleNames) } })
      : [];
    const u = this.users.create({
      email: input.email,
      passwordHash: input.passwordHash,
      displayName: input.displayName ?? null,
      isActive: true,
      roles,
    });
    const saved = await this.users.save(u);
    return toRecord(saved);
  }

  async setActive(id: string, isActive: boolean): Promise<void> {
    await this.users.update({ id }, { isActive });
  }

  async list(query: ListUsersQuery): Promise<{ users: UserRecord[]; total: number }> {
    const term = query.search?.trim();
    const where = term
      ? [
          { email: ILike(`%${term}%`) },
          { displayName: ILike(`%${term}%`) },
        ]
      : undefined;
    const [rows, total] = await this.users.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: query.offset,
      take: query.limit,
    });
    return { users: rows.map(toRecord), total };
  }

  async update(id: string, patch: UpdateUserInput): Promise<UserRecord> {
    const u = await this.users.findOne({ where: { id } });
    if (!u) throw new NotFoundException('user not found');
    if (patch.displayName !== undefined) u.displayName = patch.displayName;
    if (patch.isActive !== undefined) u.isActive = patch.isActive;
    if (patch.passwordHash !== undefined) u.passwordHash = patch.passwordHash;
    const saved = await this.users.save(u);
    return toRecord(saved);
  }

  async setRoles(id: string, roleNames: string[]): Promise<UserRecord> {
    const u = await this.users.findOne({ where: { id } });
    if (!u) throw new NotFoundException('user not found');
    const unique = Array.from(new Set(roleNames));
    u.roles = unique.length
      ? await this.roles.find({ where: { name: In(unique) } })
      : [];
    const saved = await this.users.save(u);
    return toRecord(saved);
  }

  async delete(id: string): Promise<void> {
    await this.users.delete({ id });
  }

  async countByRole(roleName: string): Promise<number> {
    return this.users
      .createQueryBuilder('u')
      .innerJoin('u.roles', 'r', 'r.name = :roleName', { roleName })
      .getCount();
  }

  async count(filter: { isActive?: boolean } = {}): Promise<number> {
    return this.users.count({ where: filter.isActive === undefined ? {} : { isActive: filter.isActive } });
  }
}
