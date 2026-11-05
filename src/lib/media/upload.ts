import type { DbOrTx } from '../db/client';
import { insertPhoto } from './repository';
import type { IncomingPhoto, MediaService } from './service';
import type { PhotoRecord } from './types';

/**
 * 사진 한 장을 처리해 파일을 저장하고 사진 정보를 데이터베이스에 넣습니다.
 * 데이터베이스에 넣지 못하면 방금 만든 파일을 지웁니다.
 */
export async function storeUploadedPhoto(
  deps: { db: DbOrTx; media: MediaService },
  file: IncomingPhoto,
): Promise<PhotoRecord> {
  const record = await deps.media.process(file);
  try {
    await insertPhoto(deps.db, record);
  } catch (error) {
    await deps.media.deleteFiles([record.id]);
    throw error;
  }
  return record;
}
