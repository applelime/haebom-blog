// @vitest-environment node
import { createServer, request as httpRequest, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertAuthorWrite, AuthorAccessError, viewerFrom } from '@/lib/access/author';
import { applyAuthorHeader, AUTHOR_HEADER, isPublicMode } from '@/lib/access/author-header';

/** server.ts와 같은 순서로 머리글을 정하고, 요청이 글쓴이로 판단됐는지 돌려주는 시험용 서버. */
let server: Server;
let port: number;

beforeAll(async () => {
  server = createServer((req, res) => {
    applyAuthorHeader(req);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ author: req.headers[AUTHOR_HEADER] ?? null }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function ask(host: string, extraHeaders: Record<string, string> = {}): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: '127.0.0.1', port, path: '/', headers: { host, ...extraHeaders } },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve(JSON.parse(body).author));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

function fakeRequest(remoteAddress: string, headers: Record<string, string>) {
  return { headers: { ...headers }, socket: { remoteAddress } } as unknown as IncomingMessage;
}

describe('글쓴이 판단 (ADR-006, FR5.4)', () => {
  it('이 컴퓨터(루프백)에서 localhost, 127.0.0.1, [::1] 주소로 연 요청만 글쓴이다', async () => {
    expect(await ask(`localhost:${port}`)).toBe('1');
    expect(await ask(`127.0.0.1:${port}`)).toBe('1');
    expect(await ask(`[::1]:${port}`)).toBe('1');
    expect(await ask('LOCALHOST')).toBe('1');
  });

  it('같은 와이파이의 다른 기기(루프백이 아닌 주소)에서 온 요청은 독자다', () => {
    const phone = fakeRequest('192.168.0.23', { host: 'localhost:3000' });
    expect(applyAuthorHeader(phone)).toBe(false);
    expect(phone.headers[AUTHOR_HEADER]).toBeUndefined();
    expect(viewerFrom(new Headers())).toBe('reader');
  });

  it('공개 모드(BLOG_PUBLIC_MODE=1)에서는 이 컴퓨터에서 연 요청도 독자다 (ADR-006)', () => {
    const local = fakeRequest('127.0.0.1', { host: 'localhost:3000' });
    expect(applyAuthorHeader(local, { publicMode: true })).toBe(false);
    expect(local.headers[AUTHOR_HEADER]).toBeUndefined();
    expect(isPublicMode({ BLOG_PUBLIC_MODE: '1' })).toBe(true);
    expect(isPublicMode({})).toBe(false);
  });

  it('밖에서 보낸 x-blog-author 머리글은 지우고 믿지 않는다', async () => {
    const spoofed = fakeRequest('192.168.0.23', {
      host: '192.168.0.10:3000',
      [AUTHOR_HEADER]: '1',
    });
    applyAuthorHeader(spoofed);
    expect(spoofed.headers[AUTHOR_HEADER]).toBeUndefined();
    expect(await ask('blog.example.com', { [AUTHOR_HEADER]: '1' })).toBeNull();
  });

  it('루프백 연결이라도 Host가 다른 도메인이면 독자다 (DNS 재바인딩 방지)', async () => {
    expect(await ask(`attacker.example:${port}`)).toBeNull();
    expect(await ask(`localhost.attacker.example:${port}`)).toBeNull();
    expect(await ask(`192.168.0.10:${port}`)).toBeNull();
  });

  it('글쓴이라도 다른 출처에서 온 쓰기 요청은 거절한다', () => {
    const base = { [AUTHOR_HEADER]: '1', host: 'localhost:3000' };
    expect(() =>
      assertAuthorWrite(new Headers({ ...base, 'sec-fetch-site': 'same-origin' })),
    ).not.toThrow();
    expect(() =>
      assertAuthorWrite(new Headers({ ...base, origin: 'http://localhost:3000' })),
    ).not.toThrow();
    const crossSite = [
      new Headers({ ...base, 'sec-fetch-site': 'cross-site' }),
      new Headers({ ...base, origin: 'https://evil.example' }),
      new Headers({ ...base, origin: 'http://localhost:4000' }),
      new Headers(base),
    ];
    for (const headers of crossSite) {
      expect(() => assertAuthorWrite(headers)).toThrow(AuthorAccessError);
    }
    expect(() =>
      assertAuthorWrite(new Headers({ host: 'localhost:3000', 'sec-fetch-site': 'same-origin' })),
    ).toThrow('글쓴이만 할 수 있습니다');
  });
});
