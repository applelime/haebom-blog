// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { insertPost } from '@/lib/post/repository';
import type { Post } from '@/lib/post/types';
import { findPostIds, upsertSearchDocument } from '@/lib/search/repository';
import { normalizeForSearch } from '@/lib/search/normalize';
import { postFields } from '../factories';
import { openTempDatabase, type TempDatabase } from '../helpers/temp-db';

let database: TempDatabase;

async function addIndexedPost(
  id: string,
  title: string,
  text: string,
  tags: string[],
  date: number,
) {
  const post: Post = {
    ...postFields({ title, tags }),
    id,
    slug: id,
    status: 'published',
    firstPublishedAt: date,
    createdAt: date,
    updatedAt: date,
  };
  await insertPost(database.db, post);
  await upsertSearchDocument(database.db, {
    postId: id,
    normalizedTitle: normalizeForSearch(title),
    normalizedText: normalizeForSearch(text),
    normalizedTags: normalizeForSearch(tags.join(' ')),
    firstPublishedAt: date,
  });
}

function search(query: string) {
  return findPostIds(database.db, normalizeForSearch(query));
}

beforeEach(async () => {
  database = await openTempDatabase('search-repo');
});

afterEach(() => {
  database.cleanup();
});

describe('검색 저장소 (ADR-007)', () => {
  it('한글 검색어는 단어 일부만 맞아도 찾는다 ("카페"로 "카페거리")', async () => {
    await addIndexedPost('cafe', '연남동 산책', '카페거리를 따라 걸었다', [], 10);
    await addIndexedPost('bread', '바게트 비교', '빵집 세 곳', ['빵'], 20);
    expect((await search('카페')).ids).toEqual(['cafe']);
    expect((await search('빵')).ids).toEqual(['bread']);
  });

  it('대소문자와 앞뒤 공백을 무시한다', async () => {
    await addIndexedPost('lisbon', 'Lisbon Tram Days', '노란 트램', ['Portugal'], 10);
    expect((await search('  lisbon ')).ids).toEqual(['lisbon']);
    expect((await search('TRAM')).ids).toEqual(['lisbon']);
    expect((await search('portugal')).ids).toEqual(['lisbon']);
  });

  it('%와 _는 글자 그대로 찾는다', async () => {
    await addIndexedPost('percent', '할인 50% 빵', '오늘만', [], 10);
    await addIndexedPost('plain', '할인 500원 빵', '오늘만', [], 20);
    await addIndexedPost('under', 'snake_case 이야기', '코드', [], 30);
    expect((await search('50%')).ids).toEqual(['percent']);
    expect((await search('%')).ids).toEqual(['percent']);
    expect((await search('e_c')).ids).toEqual(['under']);
    expect((await search('_')).ids).toEqual(['under']);
  });

  it('빈 검색어나 공백뿐인 검색어는 결과가 없다', async () => {
    await addIndexedPost('any', '아무 글', '본문', [], 10);
    expect((await search('')).ids).toEqual([]);
    expect((await search('   ')).total).toBe(0);
  });

  it('결과는 처음 발행한 날짜의 최신 순이다', async () => {
    await addIndexedPost('first', '트램 첫 글', '', [], 100);
    await addIndexedPost('third', '트램 세 번째', '', [], 300);
    await addIndexedPost('second', '트램 두 번째', '', [], 200);
    const result = await search('트램');
    expect(result.ids).toEqual(['third', 'second', 'first']);
    expect(result.total).toBe(3);
  });
});
