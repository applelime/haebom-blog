import path from 'node:path';
import { openDatabase, type Database } from './db/client';
import { createMediaService, type MediaService } from './media/service';
import { createPostService, type PostService } from './post/service';
import { createSearchService, type SearchService } from './search/service';

/**
 * 앱 전체에서 함께 쓰는 연결과 서비스. 환경 변수 DATABASE_URL, UPLOAD_DIR로 위치를 바꿀 수 있습니다.
 */
export interface Runtime {
  database: Database;
  media: MediaService;
  search: SearchService;
  posts: PostService;
}

const DEFAULT_UPLOAD_DIR = 'uploads';

let runtimePromise: Promise<Runtime> | null = null;

async function createRuntime(): Promise<Runtime> {
  const database = await openDatabase();
  const media = createMediaService({
    uploadDir: path.resolve(process.cwd(), process.env.UPLOAD_DIR || DEFAULT_UPLOAD_DIR),
  });
  const search = createSearchService();
  const posts = createPostService({ db: database.db, search, media });
  return { database, media, search, posts };
}

export function getRuntime(): Promise<Runtime> {
  if (!runtimePromise) {
    runtimePromise = createRuntime().catch((error) => {
      runtimePromise = null;
      throw error;
    });
  }
  return runtimePromise;
}

/** 테스트에서 환경 변수를 바꾼 뒤 새 연결을 만들도록 비웁니다. */
export async function resetRuntime(): Promise<void> {
  const current = runtimePromise;
  runtimePromise = null;
  if (current) (await current).database.close();
}
