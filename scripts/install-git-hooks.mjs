/**
 * `.githooks/`의 훅을 이 저장소의 git 훅 폴더로 복사합니다(`npm install` 때 prepare로 실행).
 * git 설정(core.hooksPath)은 바꾸지 않고 파일만 복사합니다.
 * git 저장소가 아니거나 git이 없으면 아무것도 하지 않고 넘어갑니다.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';

const source = path.resolve('.githooks');

function hooksDir() {
  try {
    const out = execFileSync('git', ['rev-parse', '--git-path', 'hooks'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return path.resolve(out.trim());
  } catch {
    return null;
  }
}

const target = hooksDir();
if (!target || !existsSync(source)) {
  console.log('git 훅 설치를 건너뜁니다(git 저장소가 아니거나 .githooks 폴더가 없음).');
} else {
  mkdirSync(target, { recursive: true });
  for (const name of readdirSync(source)) {
    const to = path.join(target, name);
    copyFileSync(path.join(source, name), to);
    chmodSync(to, 0o755);
    console.log(`git 훅을 설치했습니다: ${name}`);
  }
}
