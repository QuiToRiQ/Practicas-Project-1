import { Readable } from 'stream';

export interface PutOptions {
  contentType: string;
  /** Bytes. */
  sizeHint?: number;
}

export interface IFileStorage {
  /** Writes a buffer to durable storage and returns an opaque key. */
  putBuffer(key: string, data: Buffer, opts: PutOptions): Promise<{ key: string; size: number }>;
  /** Streams a previously-stored object. */
  getStream(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
}
