import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bodyParser: true,
    // Trust the reverse proxy in front of us for X-Forwarded-* headers.
    bufferLogs: false,
  });
  const cfg = app.get(ConfigService);

  app.use(helmet({
    contentSecurityPolicy: false, // CSP belongs to the frontend container's nginx
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }));
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  app.enableCors({
    origin: cfg.getOrThrow<string>('CORS_ORIGIN').split(',').map((s) => s.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // 1 MB JSON cap — file uploads go through multer with their own larger budget.
  app.use((req: { headers: Record<string, string | string[] | undefined> }, _res: unknown, next: () => void) => {
    if ((req.headers['content-type'] ?? '').toString().includes('application/json')) {
      const len = Number(req.headers['content-length'] ?? 0);
      if (len > 1_048_576) throw new Error('payload too large');
    }
    next();
  });

  const port = Number(cfg.getOrThrow('PORT'));
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`listening on :${port}`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('fatal:', err);
  process.exit(1);
});
