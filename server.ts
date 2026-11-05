import { createServer } from 'node:http';
import { parse } from 'node:url';
import { applyAuthorHeader } from './src/lib/access/author-header';
import { loadLocalEnv } from './src/lib/load-env';

/**
 * 블로그를 실행하는 Node 서버(ADR-006, NFR5).
 * - `npm run dev`: 개발 모드, `npm start`: `npm run build` 뒤 실행 모드(--production)
 * - 기본으로 0.0.0.0:3000에서 들어, 같은 와이파이의 휴대폰은 읽는 화면만 볼 수 있습니다.
 * - 요청마다 x-blog-author 머리글을 먼저 지우고, 이 컴퓨터에서 localhost로 연 요청에만 다시 넣습니다.
 */

async function main(): Promise<void> {
  loadLocalEnv();
  const production = process.argv.includes('--production');
  (process.env as Record<string, string | undefined>).NODE_ENV = production
    ? 'production'
    : 'development';
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '0.0.0.0';

  const { default: next } = await import('next');
  const server = createServer();
  const app = next({ dev: !production, hostname: 'localhost', port, httpServer: server });
  const handle = app.getRequestHandler();
  await app.prepare();

  server.on('request', (request, response) => {
    applyAuthorHeader(request);
    handle(request, response, parse(request.url ?? '/', true)).catch((error: unknown) => {
      console.error(
        JSON.stringify({
          level: 'ERROR',
          message: '요청 처리 실패',
          url: request.url,
          error: String(error),
        }),
      );
      if (!response.headersSent) response.statusCode = 500;
      response.end();
    });
  });

  server.listen(port, host, () => {
    console.log(
      `블로그가 실행 중입니다: http://localhost:${port} (글쓰기는 이 주소에서만 열립니다)`,
    );
    if (host === '0.0.0.0') {
      console.log(
        `같은 와이파이의 휴대폰에서는 http://<이 컴퓨터의 주소>:${port} 로 읽기만 할 수 있습니다.`,
      );
    }
  });
}

main().catch((error: unknown) => {
  console.error('블로그 서버를 시작하지 못했습니다.', error);
  process.exit(1);
});
