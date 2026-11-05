import { and, count, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { DbOrTx } from '../db/client';
import { postRevisions, posts, type PostRevisionRow, type PostRow } from '../db/schema';
import { TOPICS, type Post, type PostRevision, type Topic } from './types';

/**
 * PostContent의 데이터 접근. 여러 줄을 함께 바꾸는 쓰기는 서비스가 트랜잭션(db.transaction) 안에서 부릅니다.
 */

export const PAGE_SIZE = 12;

function toPost(row: PostRow): Post {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    topic: row.topic,
    tags: row.tags,
    blocks: row.blocks,
    status: row.status,
    visibility: row.visibility,
    coverPhotoId: row.coverPhotoId,
    dek: row.dek,
    firstPublishedAt: row.firstPublishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toRevision(row: PostRevisionRow): PostRevision {
  return {
    postId: row.postId,
    title: row.title,
    topic: row.topic,
    tags: row.tags,
    blocks: row.blocks,
    coverPhotoId: row.coverPhotoId,
    dek: row.dek,
    visibility: row.visibility,
    savedAt: row.savedAt,
  };
}

export async function insertPost(db: DbOrTx, post: Post): Promise<void> {
  await db.insert(posts).values(post);
}

export async function getPostById(db: DbOrTx, id: string): Promise<Post | null> {
  const rows = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
  return rows[0] ? toPost(rows[0]) : null;
}

export async function getPostBySlug(db: DbOrTx, slug: string): Promise<Post | null> {
  const rows = await db.select().from(posts).where(eq(posts.slug, slug)).limit(1);
  return rows[0] ? toPost(rows[0]) : null;
}

export async function updatePost(
  db: DbOrTx,
  id: string,
  patch: Partial<Omit<Post, 'id' | 'createdAt'>>,
): Promise<void> {
  await db.update(posts).set(patch).where(eq(posts.id, id));
}

export async function deletePost(db: DbOrTx, id: string): Promise<void> {
  await db.delete(posts).where(eq(posts.id, id));
}

export async function getRevision(db: DbOrTx, postId: string): Promise<PostRevision | null> {
  const rows = await db
    .select()
    .from(postRevisions)
    .where(eq(postRevisions.postId, postId))
    .limit(1);
  return rows[0] ? toRevision(rows[0]) : null;
}

/** 작업 사본을 저장합니다. 글 하나에 사본은 하나라서, 있으면 덮어씁니다(ADR-005). */
export async function saveRevision(db: DbOrTx, revision: PostRevision): Promise<void> {
  await db
    .insert(postRevisions)
    .values(revision)
    .onConflictDoUpdate({
      target: postRevisions.postId,
      set: {
        title: revision.title,
        topic: revision.topic,
        tags: revision.tags,
        blocks: revision.blocks,
        coverPhotoId: revision.coverPhotoId,
        dek: revision.dek,
        visibility: revision.visibility,
        savedAt: revision.savedAt,
      },
    });
}

export async function deleteRevision(db: DbOrTx, postId: string): Promise<void> {
  await db.delete(postRevisions).where(eq(postRevisions.postId, postId));
}

export interface PublishedListQuery {
  topic?: Topic;
  tag?: string;
  page?: number;
  pageSize?: number;
}

export interface PostPage {
  posts: Post[];
  total: number;
  page: number;
  pageCount: number;
}

function publicPublishedCondition(): SQL {
  return and(eq(posts.status, 'published'), eq(posts.visibility, 'public')) as SQL;
}

/** 발행된 공개 글만, 처음 발행한 날짜의 최신 순으로 한 쪽씩 돌려줍니다(FR5.2, FR7.2, FR9). */
export async function listPublishedPosts(
  db: DbOrTx,
  query: PublishedListQuery = {},
): Promise<PostPage> {
  const pageSize = query.pageSize ?? PAGE_SIZE;
  const conditions: SQL[] = [publicPublishedCondition()];
  if (query.topic) conditions.push(eq(posts.topic, query.topic));
  if (query.tag) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM json_each(${posts.tags}) WHERE json_each.value = ${query.tag})`,
    );
  }
  const where = and(...conditions);
  const [{ total }] = await db.select({ total: count() }).from(posts).where(where);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, Math.floor(query.page ?? 1)), pageCount);
  const rows = await db
    .select()
    .from(posts)
    .where(where)
    .orderBy(desc(posts.firstPublishedAt), desc(posts.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return { posts: rows.map(toPost), total, page, pageCount };
}

/** id 순서를 지키며 발행된 공개 글만 돌려줍니다(검색 결과용). */
export async function getPublishedPostsByIds(db: DbOrTx, ids: string[]): Promise<Post[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select()
    .from(posts)
    .where(and(publicPublishedCondition(), inArray(posts.id, ids)));
  const byId = new Map(rows.map((row) => [row.id, toPost(row)]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

export interface AuthorPostRow extends Post {
  hasRevision: boolean;
}

/** 내 글 목록: 모든 글과, 고치는 중인 사본이 있는지(FR6.1, FR4.5). 최근에 고친 순입니다. */
export async function listPostsForAuthor(db: DbOrTx): Promise<AuthorPostRow[]> {
  const rows = await db
    .select({ post: posts, revisionSavedAt: postRevisions.savedAt })
    .from(posts)
    .leftJoin(postRevisions, eq(postRevisions.postId, posts.id))
    .orderBy(desc(posts.updatedAt));
  return rows.map((row) => ({ ...toPost(row.post), hasRevision: row.revisionSavedAt !== null }));
}

/** 목차 창에 쓰는 주제별 공개 글 수. */
export async function countPublishedByTopic(db: DbOrTx): Promise<Record<Topic, number>> {
  const rows = await db
    .select({ topic: posts.topic, total: count() })
    .from(posts)
    .where(publicPublishedCondition())
    .groupBy(posts.topic);
  const counts = Object.fromEntries(TOPICS.map((topic) => [topic, 0])) as Record<Topic, number>;
  for (const row of rows) counts[row.topic] = row.total;
  return counts;
}
