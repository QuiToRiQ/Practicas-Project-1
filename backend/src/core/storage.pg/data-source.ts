import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { UserEntity } from './entities/user.entity';
import { RoleEntity } from './entities/role.entity';
import { PermissionEntity } from './entities/permission.entity';
import { RefreshTokenEntity } from './entities/refresh-token.entity';
import { SpreadsheetEntity } from './entities/spreadsheet.entity';
import { SpreadsheetRowEntity } from './entities/spreadsheet-row.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USER!,
  password: process.env.DB_PASSWORD!,
  database: process.env.DB_NAME!,
  entities: [
    UserEntity,
    RoleEntity,
    PermissionEntity,
    RefreshTokenEntity,
    SpreadsheetEntity,
    SpreadsheetRowEntity,
  ],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  synchronize: false,
  logging: false,
});