import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { CurrentUser, RequestUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermissions } from '../permissions/permissions.decorator';
import { PermissionsGuard } from '../permissions/permissions.guard';
import {
  ExportQueryDto,
  ListRowsQueryDto,
  MergeDto,
  UpdateCellDto,
} from './dto/spreadsheet.dto';
import { SpreadsheetsService } from './spreadsheets.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('spreadsheets')
export class SpreadsheetsController {
  constructor(
    private readonly sheets: SpreadsheetsService,
    private readonly cfg: ConfigService,
  ) {}

  @RequirePermissions('sheets:read')
  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.sheets.list(user.id);
  }

  @RequirePermissions('sheets:write')
  @Post('upload')
  @UseInterceptors(FilesInterceptor('files', 20))
  async upload(
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    if (!files || files.length === 0) throw new BadRequestException('no files uploaded');
    const maxBytes = Number(this.cfg.getOrThrow('MAX_UPLOAD_BYTES'));
    const created = [];
    for (const f of files) {
      if (f.size > maxBytes) throw new BadRequestException(`${f.originalname}: too large`);
      created.push(
        await this.sheets.uploadOne({
          ownerId: user.id,
          originalName: f.originalname,
          buffer: f.buffer,
        }),
      );
    }
    return { created };
  }

  @RequirePermissions('sheets:write')
  @Post('merge')
  merge(@CurrentUser() user: RequestUser, @Body() dto: MergeDto) {
    return this.sheets.merge(user.id, dto);
  }

  @RequirePermissions('sheets:read')
  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: RequestUser) {
    return this.sheets.get(id, user.id);
  }

  @RequirePermissions('sheets:read')
  @Get(':id/rows')
  rows(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: ListRowsQueryDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.sheets.listRows({
      spreadsheetId: id,
      requesterId: user.id,
      offset: query.offset ?? 0,
      limit: Math.min(query.limit ?? 100, 500),
    });
  }

  @RequirePermissions('sheets:write')
  @Patch(':id/rows/:rowId')
  updateCell(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('rowId', new ParseUUIDPipe()) rowId: string,
    @Body() dto: UpdateCellDto,
    @CurrentUser() user: RequestUser,
  ) {
    // Whitelist the JSON-serialisable scalars we'll accept as a cell.
    const v = dto.value;
    const isCell =
      v === null ||
      typeof v === 'string' ||
      typeof v === 'number' ||
      typeof v === 'boolean';
    if (!isCell) throw new BadRequestException('value must be string | number | boolean | null');
    return this.sheets.updateCell({
      spreadsheetId: id,
      rowId,
      column: dto.column,
      value: v,
      requesterId: user.id,
    });
  }

  @RequirePermissions('sheets:delete')
  @Delete(':id')
  @HttpCode(204)
  async delete(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: RequestUser) {
    await this.sheets.delete(id, user.id);
  }

  @RequirePermissions('sheets:export')
  @Get(':id/export')
  async export(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: ExportQueryDto,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    const format = query.format ?? 'xlsx';
    const { buffer, contentType, filename } = await this.sheets.export(id, user.id, format);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}
