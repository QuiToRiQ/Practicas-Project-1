import { createReadStream, promises as fs } from 'fs';
import { dirname, join, normalize, resolve } from 'path';
import { Readable } from 'stream';
import { IFileStorage, PutOptions } from '../storage/ports/file.storage';

/**
 * Disk-backed adapter. Swap with an Azure Blob or GCS adapter without touching
 * call sites — only the binding in StorageModule needs to change.
 */
export class LocalFileStorage implements IFileStorage {
  private readonly root: string;

  constructor(rootPath: string) {
    this.root = resolve(rootPath);
  }

  private safePath(key: string): string {
    const target = resolve(join(this.root, normalize(key)));
    if (!target.startsWith(this.root + '/') && target !== this.root) {
      throw new Error('storage key escapes root');
    }
    return target;
  }

  async putBuffer(key: string, data: Buffer, _opts: PutOptions): Promise<{ key: string; size: number }> {
    const path = this.safePath(key);
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(path, data, { mode: 0o600 });
    return { key, size: data.length };
  }

  async getStream(key: string): Promise<Readable> {
    const path = this.safePath(key);
    await fs.access(path);
    return createReadStream(path);
  }

  async delete(key: string): Promise<void> {
    const path = this.safePath(key);
    await fs.rm(path, { force: true });
  }
}
