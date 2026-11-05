import type { Viewer } from '../post/types';
import { AUTHOR_HEADER, isLocalHostHeader } from './author-header';

/**
 * 서버 쪽 글쓴이 판단(ADR-006). 모든 서버 액션과 쓰기 경로가 assertAuthorWrite를 거칩니다.
 */

type HeaderSource = Pick<Headers, 'get'>;

export class AuthorAccessError extends Error {
  constructor(public readonly reason: 'not-author' | 'cross-site') {
    super(reason === 'not-author' ? '글쓴이만 할 수 있습니다' : '다른 사이트에서 온 요청입니다');
    this.name = 'AuthorAccessError';
  }
}

/** server.ts가 넣은 글쓴이 머리글이 있는지. */
export function isAuthorRequest(headers: HeaderSource): boolean {
  return headers.get(AUTHOR_HEADER) === '1';
}

export function viewerFrom(headers: HeaderSource): Viewer {
  return isAuthorRequest(headers) ? 'author' : 'reader';
}

/**
 * 쓰기 요청이 같은 사이트에서 왔는지. 브라우저가 보내는 Sec-Fetch-Site를 먼저 보고,
 * 없으면 Origin의 호스트가 요청 Host와 같고 이 컴퓨터 주소인지 확인합니다. 둘 다 없으면 거절합니다.
 */
export function isSameOriginRequest(headers: HeaderSource): boolean {
  const fetchSite = headers.get('sec-fetch-site');
  if (fetchSite) return fetchSite === 'same-origin';
  const origin = headers.get('origin');
  const host = headers.get('host');
  if (!origin || !host) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  return originHost.toLowerCase() === host.toLowerCase() && isLocalHostHeader(originHost);
}

/** 글쓴이의 같은 사이트 요청이 아니면 AuthorAccessError를 던집니다. */
export function assertAuthorWrite(headers: HeaderSource): void {
  if (!isAuthorRequest(headers)) throw new AuthorAccessError('not-author');
  if (!isSameOriginRequest(headers)) throw new AuthorAccessError('cross-site');
}
