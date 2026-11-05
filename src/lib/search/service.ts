import type { DbOrTx } from '../db/client';
import { isPhotoBlock } from '../post/blocks';
import { isPubliclyVisible, type Post } from '../post/types';
import { normalizeForSearch } from './normalize';
import * as searchRepository from './repository';
import type { SearchDocument } from './repository';

/** 글에서 검색에 쓸 글자(본문, 소제목, 인용문, 사진 설명)를 모읍니다. */
function collectText(post: Pick<Post, 'blocks'>): string {
  const parts: string[] = [];
  for (const block of post.blocks) {
    if (block.type === 'text') parts.push(block.heading, block.text);
    else if (block.type === 'quote') parts.push(block.text);
    if (block.type === 'photo-side') parts.push(block.heading, block.text);
    if (isPhotoBlock(block)) {
      parts.push(block.caption, ...block.photos.map((photo) => photo.caption));
    }
  }
  return parts.filter((part) => part.trim() !== '').join('\n');
}

/** 글을 정리된 검색 내용(NFC, 소문자)으로 바꿉니다(ADR-007). */
export function buildSearchDocument(post: Post): SearchDocument {
  return {
    postId: post.id,
    normalizedTitle: normalizeForSearch(post.title),
    normalizedText: normalizeForSearch(collectText(post)),
    normalizedTags: normalizeForSearch(post.tags.join(' ')),
    firstPublishedAt: post.firstPublishedAt ?? post.createdAt,
  };
}

export interface SearchStore {
  upsertSearchDocument(db: DbOrTx, document: SearchDocument): Promise<void>;
  deleteSearchDocument(db: DbOrTx, postId: string): Promise<void>;
  findPostIds(
    db: DbOrTx,
    normalizedQuery: string,
    options?: { limit?: number; offset?: number },
  ): Promise<{ ids: string[]; total: number }>;
}

export interface SearchPage {
  query: string;
  ids: string[];
  total: number;
  page: number;
  pageCount: number;
}

export function createSearchService(store: SearchStore = searchRepository) {
  /** 글이 바뀔 때 부릅니다. 발행된 공개 글만 검색 내용에 남깁니다. PostContent가 같은 트랜잭션에서 부릅니다. */
  async function syncPost(tx: DbOrTx, post: Post): Promise<void> {
    if (isPubliclyVisible(post)) {
      await store.upsertSearchDocument(tx, buildSearchDocument(post));
    } else {
      await store.deleteSearchDocument(tx, post.id);
    }
  }

  async function removePost(tx: DbOrTx, postId: string): Promise<void> {
    await store.deleteSearchDocument(tx, postId);
  }

  async function search(
    db: DbOrTx,
    rawQuery: string,
    options: { page?: number; pageSize?: number } = {},
  ): Promise<SearchPage> {
    const query = normalizeForSearch(rawQuery);
    const pageSize = options.pageSize ?? 12;
    if (query === '') return { query, ids: [], total: 0, page: 1, pageCount: 1 };
    const requested = Math.max(1, Math.floor(options.page ?? 1));
    const result = await store.findPostIds(db, query, {
      limit: pageSize,
      offset: (requested - 1) * pageSize,
    });
    const pageCount = Math.max(1, Math.ceil(result.total / pageSize));
    return { query, ids: result.ids, total: result.total, page: requested, pageCount };
  }

  return { syncPost, removePost, search };
}

export type SearchService = ReturnType<typeof createSearchService>;
