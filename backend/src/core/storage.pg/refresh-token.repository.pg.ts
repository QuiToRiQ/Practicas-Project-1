import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import {
  IRefreshTokenRepository,
  RefreshTokenRecord,
} from '../storage/ports/refresh-token.repository';
import { RefreshTokenEntity } from './entities/refresh-token.entity';

@Injectable()
export class RefreshTokenPgRepository implements IRefreshTokenRepository {
  constructor(
    @InjectRepository(RefreshTokenEntity)
    private readonly repo: Repository<RefreshTokenEntity>,
  ) {}

  async create(input: { userId: string; tokenHash: string; expiresAt: Date }): Promise<RefreshTokenRecord> {
    const created = await this.repo.save(
      this.repo.create({
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        revokedAt: null,
      }),
    );
    return { ...created };
  }

  async findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const r = await this.repo.findOne({ where: { tokenHash, revokedAt: IsNull() } });
    return r ?? null;
  }

  async revoke(id: string): Promise<void> {
    await this.repo.update({ id }, { revokedAt: new Date() });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.repo.update({ userId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }
}
