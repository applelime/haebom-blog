import { eq, inArray } from 'drizzle-orm';
import type { DbOrTx } from '../db/client';
import { photos, type PhotoRow } from '../db/schema';
import type { PhotoRecord } from './types';

function toPhoto(row: PhotoRow): PhotoRecord {
  return {
    id: row.id,
    originalFile: row.originalFile,
    format: row.format,
    width: row.width,
    height: row.height,
    sizeBytes: row.sizeBytes,
    variants: row.variants,
    createdAt: row.createdAt,
  };
}

export async function insertPhoto(db: DbOrTx, photo: PhotoRecord): Promise<void> {
  await db.insert(photos).values(photo);
}

export async function getPhoto(db: DbOrTx, id: string): Promise<PhotoRecord | null> {
  const rows = await db.select().from(photos).where(eq(photos.id, id)).limit(1);
  return rows[0] ? toPhoto(rows[0]) : null;
}

export async function getPhotosByIds(db: DbOrTx, ids: string[]): Promise<PhotoRecord[]> {
  if (ids.length === 0) return [];
  const rows = await db.select().from(photos).where(inArray(photos.id, ids));
  return rows.map(toPhoto);
}

export async function deletePhotos(db: DbOrTx, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.delete(photos).where(inArray(photos.id, ids));
}
