import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../storage.pg/entities/user.entity';
import { RoleEntity } from '../storage.pg/entities/role.entity';
import { PermissionEntity } from '../storage.pg/entities/permission.entity';
import { RefreshTokenEntity } from '../storage.pg/entities/refresh-token.entity';
import { SpreadsheetEntity } from '../storage.pg/entities/spreadsheet.entity';
import { SpreadsheetRowEntity } from '../storage.pg/entities/spreadsheet-row.entity';
import { UserPgRepository } from '../storage.pg/user.repository.pg';
import { RefreshTokenPgRepository } from '../storage.pg/refresh-token.repository.pg';
import { PermissionPgRepository } from '../storage.pg/permission.repository.pg';
import { RolePgRepository } from '../storage.pg/role.repository.pg';
import { SpreadsheetPgRepository } from '../storage.pg/spreadsheet.repository.pg';
import { LocalFileStorage } from '../storage.local/file.storage.local';
import {
  FILE_STORAGE,
  PERMISSION_REPOSITORY,
  REFRESH_TOKEN_REPOSITORY,
  ROLE_REPOSITORY,
  SPREADSHEET_REPOSITORY,
  USER_REPOSITORY,
} from './ports/tokens';

/**
 * Wires the chosen adapters behind the port tokens. Swap `STORAGE_DRIVER` (or
 * extend with new branches) to point identity, persistence or file storage at
 * Azure / GCS / external IdP without touching call sites.
 */
@Module({})
export class StorageModule {
  static forRoot(): DynamicModule {
    const entities = [
      UserEntity,
      RoleEntity,
      PermissionEntity,
      RefreshTokenEntity,
      SpreadsheetEntity,
      SpreadsheetRowEntity,
    ];

    return {
      module: StorageModule,
      global: true,
      imports: [
        TypeOrmModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (cfg: ConfigService) => ({
            type: 'postgres',
            host: cfg.getOrThrow<string>('DB_HOST'),
            port: Number(cfg.getOrThrow('DB_PORT')),
            username: cfg.getOrThrow<string>('DB_USER'),
            password: cfg.getOrThrow<string>('DB_PASSWORD'),
            database: cfg.getOrThrow<string>('DB_NAME'),
            entities,
            // For v1 we let TypeORM sync the schema; replace with migrations
            // once the data model stabilises.
            synchronize: cfg.get<string>('NODE_ENV') !== 'production',
            autoLoadEntities: false,
            logging: false,
          }),
        }),
        TypeOrmModule.forFeature(entities),
      ],
      providers: [
        { provide: USER_REPOSITORY, useClass: UserPgRepository },
        { provide: REFRESH_TOKEN_REPOSITORY, useClass: RefreshTokenPgRepository },
        { provide: PERMISSION_REPOSITORY, useClass: PermissionPgRepository },
        { provide: ROLE_REPOSITORY, useClass: RolePgRepository },
        { provide: SPREADSHEET_REPOSITORY, useClass: SpreadsheetPgRepository },
        {
          provide: FILE_STORAGE,
          useFactory: (cfg: ConfigService) => {
            const driver = cfg.getOrThrow<string>('STORAGE_DRIVER');
            switch (driver) {
              case 'local':
                return new LocalFileStorage(cfg.getOrThrow<string>('STORAGE_LOCAL_PATH'));
              default:
                throw new Error(`STORAGE_DRIVER="${driver}" has no adapter wired yet`);
            }
          },
          inject: [ConfigService],
        },
      ],
      exports: [
        USER_REPOSITORY,
        REFRESH_TOKEN_REPOSITORY,
        PERMISSION_REPOSITORY,
        ROLE_REPOSITORY,
        SPREADSHEET_REPOSITORY,
        FILE_STORAGE,
      ],
    };
  }
}
