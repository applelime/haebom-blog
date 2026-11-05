// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import type { Post } from '@/lib/post/types';
import type { SearchDocument } from '@/lib/search/repository';
import { buildSearchDocument, createSearchService, type SearchStore } from '@/lib/search/service';
import { bodyBlock, photoRef, postFields, quoteBlock, textBlock } from '../factories';

/** 데이터베이스 대신 쓰는 간단한 검색 저장소. 부분 일치와 최신 순만 흉내 냅니다. */
function memoryStore(): SearchStore & { documents: Map<string, SearchDocument> } {
  const documents = new Map<string, SearchDocument>();
  return {
    documents,
    async upsertSearchDocument(_db, document) {
      documents.set(document.postId, document);
    },
    async deleteSearchDocument(_db, postId) {
      documents.delete(postId);
    },
    async findPostIds(_db, query) {
      const ids = [...documents.values()]
        .filter((doc) =>
          [doc.normalizedTitle, doc.normalizedText, doc.normalizedTags].some((v) =>
            v.includes(query),
          ),
        )
        .sort((a, b) => b.firstPublishedAt - a.firstPublishedAt)
        .map((doc) => doc.postId);
      return { ids, total: ids.length };
    },
  };
}

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    ...postFields(),
    id: 'lisbon',
    slug: 'lisbon',
    status: 'published',
    visibility: 'public',
    firstPublishedAt: 100,
    createdAt: 50,
    updatedAt: 100,
    ...overrides,
  };
}

const fakeTx = {} as never;
let store: ReturnType<typeof memoryStore>;
let service: ReturnType<typeof createSearchService>;

beforeEach(() => {
  store = memoryStore();
  service = createSearchService(store);
});

describe('Search 업무 규칙 (ADR-007)', () => {
  it('제목, 본문(글·인용문·사진 설명), 태그를 소문자로 정리한 검색 내용을 만든다', () => {
    const post = makePost({
      title: 'Lisbon 트램',
      tags: ['Portugal', '도보여행'],
      blocks: [
        textBlock('Alfama 골목을 걸었다', '창가의 도시'),
        quoteBlock('같은 골목을 이틀 연속'),
        bodyBlock(photoRef('p1', '노란 TRAM')),
      ],
    });
    const document = buildSearchDocument(post);
    expect(document.normalizedTitle).toBe('lisbon 트램');
    expect(document.normalizedText).toContain('alfama 골목을 걸었다');
    expect(document.normalizedText).toContain('창가의 도시');
    expect(document.normalizedText).toContain('같은 골목을 이틀 연속');
    expect(document.normalizedText).toContain('노란 tram');
    expect(document.normalizedTags).toBe('portugal 도보여행');
    expect(document.firstPublishedAt).toBe(100);
  });

  it('발행된 공개 글을 저장하면 검색에 나온다', async () => {
    await service.syncPost(fakeTx, makePost());
    const result = await service.search(fakeTx, '  트램 ');
    expect(result.ids).toEqual(['lisbon']);
    expect(result.query).toBe('트램');
  });

  it('비공개로 바꾸거나 임시 저장 상태면 검색에서 빠진다 (FR10.4)', async () => {
    await service.syncPost(fakeTx, makePost());
    await service.syncPost(fakeTx, makePost({ visibility: 'private' }));
    expect(store.documents.size).toBe(0);
    await service.syncPost(fakeTx, makePost({ id: 'draft', status: 'draft' }));
    expect((await service.search(fakeTx, '리스본')).ids).toEqual([]);
  });

  it('글을 지우면 검색에서 빠진다', async () => {
    await service.syncPost(fakeTx, makePost());
    await service.removePost(fakeTx, 'lisbon');
    expect((await service.search(fakeTx, 'lisbon')).total).toBe(0);
  });

  it('조합형으로 입력한 한글(NFD)도 완성형(NFC)으로 정리해 찾는다', async () => {
    const decomposed = '카페거리'.normalize('NFD');
    expect(decomposed).not.toBe('카페거리');
    await service.syncPost(fakeTx, makePost({ id: 'cafe', title: decomposed }));
    expect(buildSearchDocument(makePost({ title: decomposed })).normalizedTitle).toBe('카페거리');
    expect((await service.search(fakeTx, '카페'.normalize('NFD'))).ids).toEqual(['cafe']);
  });
});
