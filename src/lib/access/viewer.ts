import { headers } from 'next/headers';
import type { Viewer } from '../post/types';
import { viewerFrom } from './author';

/** 서버 화면에서 지금 요청을 보는 사람이 글쓴이인지 독자인지 정합니다(ADR-006). */
export async function getViewer(): Promise<Viewer> {
  return viewerFrom(await headers());
}
