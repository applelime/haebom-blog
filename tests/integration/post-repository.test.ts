// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '@/lib/db/client';
import {
  countPublishedByTopic,
  deleteRevision,
  getPostById,
  getRevision,
  insertPost,
  listPostsForAuthor,
  listPublishedPosts,
  saveRevision,
  updatePost,
} from '@/lib/post/repository';
import type { Post } from '@/lib/post/types';
import { postFields, textBlock } from '../factories';
import { openTempDatabase, type TempDatabase } from '../helpers/temp-db';

let database: TempDatabase;
let sequence = 0;

function makePost(overrides: Partial<Post> = {}): Post {
  sequence += 1;
  const id = overrides.id ?? `post${sequence}`;
  return {
    ...postFields(),
    id,
    slug: id,
    status: 'published',
    visibility: 'public',
    firstPublishedAt: 1_000 + sequence,
    createdAt: 1_000 + sequence,
    updatedAt: 1_000 + sequence,
    ...overrides,
  };
}

beforeEach(async () => {
  database = await openTempDatabase('post-repo');
});

afterEach(() => {
  database.cleanup();
});

describe('글 저장소 (PostContent 데이터 접근)', () => {
  it('저장한 글은 프로그램을 다시 켜도(데이터베이스를 다시 열어도) 같은 내용으로 읽힌다 (NFR4)', async () => {
    const post = makePost({ id: 'lisbon', status: 'draft', firstPublishedAt: null });
    await insertPost(database.db, post);
    await updatePost(database.db, 'lisbon', {
      title: '고친 제목',
      blocks: [textBlock('고친 본문')],
      updatedAt: 9_999,
    });

    const reopened = await openDatabase(database.url);
    const stored = await getPostById(reopened.db, 'lisbon');
    reopened.close();
    expect(stored?.title).toBe('고친 제목');
    expect(stored?.blocks).toHaveLength(1);
    expect(stored?.tags).toEqual(post.tags);
    expect(stored?.status).toBe('draft');
  });

  it('트랜잭션 중간에 실패하면 직전에 저장된 내용이 그대로 남는다 (NFR4)', async () => {
    await insertPost(database.db, makePost({ id: 'safe', title: '직전 제목' }));
    await expect(
      database.db.transaction(async (tx) => {
        await updatePost(tx, 'safe', { title: '반쯤 저장된 제목' });
        throw new Error('저장 중 문제');
      }),
    ).rejects.toThrow('저장 중 문제');
    const stored = await getPostById(database.db, 'safe');
    expect(stored?.title).toBe('직전 제목');
  });

  it('작업 사본은 글 하나에 하나만 남고, 버리면 사라진다 (ADR-005)', async () => {
    await insertPost(database.db, makePost({ id: 'edited' }));
    await saveRevision(database.db, {
      ...postFields({ title: '첫 사본' }),
      postId: 'edited',
      savedAt: 1,
    });
    await saveRevision(database.db, {
      ...postFields({ title: '두 번째 사본', visibility: 'private' }),
      postId: 'edited',
      savedAt: 2,
    });
    const revision = await getRevision(database.db, 'edited');
    expect(revision?.title).toBe('두 번째 사본');
    expect(revision?.visibility).toBe('private');
    expect((await listPostsForAuthor(database.db))[0].hasRevision).toBe(true);

    await deleteRevision(database.db, 'edited');
    expect(await getRevision(database.db, 'edited')).toBeNull();
    expect((await getPostById(database.db, 'edited'))?.title).toBe(postFields().title);
  });

  it('목록에는 발행된 공개 글만 나오고 임시 저장 글과 비공개 글은 빠진다 (FR5.2)', async () => {
    await insertPost(database.db, makePost({ id: 'public1' }));
    await insertPost(
      database.db,
      makePost({ id: 'draft1', status: 'draft', firstPublishedAt: null }),
    );
    await insertPost(database.db, makePost({ id: 'private1', visibility: 'private' }));
    const page = await listPublishedPosts(database.db);
    expect(page.posts.map((post) => post.id)).toEqual(['public1']);
    expect(page.total).toBe(1);
    const counts = await countPublishedByTopic(database.db);
    expect(counts).toEqual({ travel: 1, daily: 0, taste: 0, work: 0 });
  });

  it('주제와 태그로 공개 글을 모아 본다 (FR9.1, FR9.2)', async () => {
    await insertPost(
      database.db,
      makePost({ id: 'travel1', topic: 'travel', tags: ['리스본', '트램'] }),
    );
    await insertPost(database.db, makePost({ id: 'daily1', topic: 'daily', tags: ['카페'] }));
    await insertPost(database.db, makePost({ id: 'daily2', topic: 'daily', tags: ['리스본'] }));

    const daily = await listPublishedPosts(database.db, { topic: 'daily' });
    expect(daily.posts.map((post) => post.id)).toEqual(['daily2', 'daily1']);
    const lisbon = await listPublishedPosts(database.db, { tag: '리스본' });
    expect(lisbon.posts.map((post) => post.id)).toEqual(['daily2', 'travel1']);
    const none = await listPublishedPosts(database.db, { tag: '리스' });
    expect(none.posts).toHaveLength(0);
  });

  it('한 쪽에 12개씩 나누고, 쪽 번호가 범위를 넘으면 마지막 쪽을 보여준다 (FR9.3)', async () => {
    for (let index = 0; index < 14; index += 1) {
      await insertPost(database.db, makePost({ id: `many${index}` }));
    }
    const first = await listPublishedPosts(database.db, { page: 1 });
    expect(first.posts).toHaveLength(12);
    expect(first.pageCount).toBe(2);
    const second = await listPublishedPosts(database.db, { page: 2 });
    expect(second.posts).toHaveLength(2);
    const beyond = await listPublishedPosts(database.db, { page: 9 });
    expect(beyond.page).toBe(2);
  });

  it('목록은 처음 발행한 날짜의 최신 순이다 (FR7.2)', async () => {
    await insertPost(database.db, makePost({ id: 'old', firstPublishedAt: 100, updatedAt: 9_000 }));
    await insertPost(database.db, makePost({ id: 'new', firstPublishedAt: 300, updatedAt: 200 }));
    await insertPost(database.db, makePost({ id: 'mid', firstPublishedAt: 200, updatedAt: 100 }));
    const page = await listPublishedPosts(database.db);
    expect(page.posts.map((post) => post.id)).toEqual(['new', 'mid', 'old']);
  });
});
