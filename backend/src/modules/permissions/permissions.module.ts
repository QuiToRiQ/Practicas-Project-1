import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionEntity } from '../../core/storage.pg/entities/permission.entity';
import { RoleEntity } from '../../core/storage.pg/entities/role.entity';
import { PermissionsGuard } from './permissions.guard';
import { PermissionsSeeder } from './permissions.seeder';

@Module({
  imports: [TypeOrmModule.forFeature([PermissionEntity, RoleEntity])],
  providers: [PermissionsGuard, PermissionsSeeder],
  exports: [PermissionsGuard],
})
export class PermissionsModule {}
