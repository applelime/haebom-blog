import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';

/** 프로젝트 안 `.test-tmp/` 아래에 테스트 전용 폴더를 만듭니다(git 제외). */
export function makeTempDir(label: string): { dir: string; remove(): void } {
  const dir = path.resolve(process.cwd(), '.test-tmp', `${label}-${nanoid(8)}`);
  mkdirSync(dir, { recursive: true });
  return {
    dir,
    remove: () => rmSync(dir, { recursive: true, force: true }),
  };
}
