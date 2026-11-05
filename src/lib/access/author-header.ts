import type { IncomingMessage } from 'node:http';

/**
 * 글쓴이 판단 머리글(ADR-006, 첫 버전 시험용 초기 방식).
 * server.ts가 요청마다 이 머리글을 먼저 지우고, 조건이 맞을 때만 다시 넣습니다.
 * 공개 전에는 로그인으로 바꿔야 합니다(docs/publishing-plan.md).
 */
export const AUTHOR_HEADER = 'x-blog-author';

const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

/** 연결의 실제 상대 주소가 이 컴퓨터(루프백)인지. 사람이 바꿀 수 있는 머리글은 보지 않습니다. */
export function isLoopbackAddress(address: string | undefined): boolean {
  return address !== undefined && LOOPBACK_ADDRESSES.has(address);
}

/** Host 머리글이 localhost, 127.0.0.1, [::1] 중 하나인지(포트는 있어도 됨). 다른 도메인이면 아닙니다(DNS 재바인딩 방지). */
export function isLocalHostHeader(host: string | undefined): boolean {
  if (!host) return false;
  const value = host.trim().toLowerCase();
  const match = /^(\[[0-9a-f:.]+\]|[^:]+)(?::(\d{1,5}))?$/.exec(value);
  if (!match) return false;
  return LOCAL_HOSTNAMES.has(match[1]);
}

/** 공개 모드(BLOG_PUBLIC_MODE=1)에서는 루프백 판단을 끄고 아무도 글쓴이로 보지 않습니다. 쓰기 기능이 모두 막힙니다. */
export function isPublicMode(env: Record<string, string | undefined> = process.env): boolean {
  return env.BLOG_PUBLIC_MODE === '1';
}

/** 요청의 글쓴이 머리글을 정합니다. 밖에서 보낸 같은 이름의 머리글은 언제나 지웁니다. */
export function applyAuthorHeader(
  request: Pick<IncomingMessage, 'headers' | 'socket'>,
  options: { publicMode?: boolean } = {},
): boolean {
  delete request.headers[AUTHOR_HEADER];
  const publicMode = options.publicMode ?? isPublicMode();
  const isAuthor =
    !publicMode &&
    isLoopbackAddress(request.socket.remoteAddress) &&
    isLocalHostHeader(request.headers.host);
  if (isAuthor) request.headers[AUTHOR_HEADER] = '1';
  return isAuthor;
}
