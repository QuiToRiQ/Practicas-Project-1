import { Module } from '@nestjs/common';
import { PermissionsModule } from '../permissions/permissions.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [PermissionsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
