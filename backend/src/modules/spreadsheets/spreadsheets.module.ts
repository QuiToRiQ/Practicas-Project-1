import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { PermissionsModule } from '../permissions/permissions.module';
import { ExportService } from './export.service';
import { MergeService } from './merge.service';
import { SpreadsheetParser } from './parser.service';
import { SpreadsheetsController } from './spreadsheets.controller';
import { SpreadsheetsService } from './spreadsheets.service';

@Module({
  imports: [
    ConfigModule,
    PermissionsModule,
    MulterModule.register({
      storage: memoryStorage(),
      limits: {
        fileSize: Number(process.env.MAX_UPLOAD_BYTES ?? 52_428_800),
        files: 20,
      },
    }),
  ],
  controllers: [SpreadsheetsController],
  providers: [SpreadsheetsService, SpreadsheetParser, MergeService, ExportService],
})
export class SpreadsheetsModule {}
