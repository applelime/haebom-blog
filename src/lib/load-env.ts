import { existsSync } from 'node:fs';
import path from 'node:path';

/** 프로젝트 최상위의 .env가 있으면 읽습니다(이미 정한 환경 변수는 그대로 둡니다). */
export function loadLocalEnv(): void {
  const file = path.resolve(process.cwd(), '.env');
  if (existsSync(file) && typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(file);
  }
}
