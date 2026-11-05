import path from 'node:path';
import { openDatabase, type Database } from '@/lib/db/client';
import { makeTempDir } from './temp-dir';

export interface TempDatabase extends Database {
  dir: string;
  url: string;
  cleanup(): void;
}

/** 테스트마다 새 SQLite 파일을 만들고, 끝나면 cleanup()으로 지웁니다. */
export async function openTempDatabase(label = 'db'): Promise<TempDatabase> {
  const temp = makeTempDir(label);
  const url = `file:${path.join(temp.dir, 'blog.db')}`;
  const database = await openDatabase(url);
  return {
    ...database,
    dir: temp.dir,
    url,
    cleanup: () => {
      database.close();
      temp.remove();
    },
  };
}
