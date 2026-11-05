import { and, desc, eq, or, sql } from 'drizzle-orm';
import type { DbOrTx } from '../db/client';
import { posts, searchDocuments } from '../db/schema';

export interface SearchDocument {
  postId: string;
  normalizedTitle: string;
  normalizedText: string;
  normalizedTags: string;
  firstPublishedAt: number;
}

/** LIKE 검색에서 %, _, \ 를 글자 그대로 찾도록 앞에 \ 를 붙입니다. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export async function upsertSearchDocument(db: DbOrTx, document: SearchDocument): Promise<void> {
  await db
    .insert(searchDocuments)
    .values(document)
    .onConflictDoUpdate({
      target: searchDocuments.postId,
      set: {
        normalizedTitle: document.normalizedTitle,
        normalizedText: document.normalizedText,
        normalizedTags: document.normalizedTags,
        firstPublishedAt: document.firstPublishedAt,
      },
    });
}

export async function deleteSearchDocument(db: DbOrTx, postId: string): Promise<void> {
  await db.delete(searchDocuments).where(eq(searchDocuments.postId, postId));
}

/**
 * 정리된 검색어(normalizedQuery)를 제목, 본문, 태그에서 부분 일치로 찾아 글 id를 최신 순으로 돌려줍니다(ADR-007).
 * 검색어는 매개변수로만 넘기고, 공개 발행 글만 남도록 posts 표와 한 번 더 맞춰 봅니다.
 */
export async function findPostIds(
  db: DbOrTx,
  normalizedQuery: string,
  options: { limit?: number; offset?: number } = {},
): Promise<{ ids: string[]; total: number }> {
  if (normalizedQuery === '') return { ids: [], total: 0 };
  const pattern = `%${escapeLikePattern(normalizedQuery)}%`;
  const matches = or(
    sql`${searchDocuments.normalizedTitle} LIKE ${pattern} ESCAPE '\\'`,
    sql`${searchDocuments.normalizedText} LIKE ${pattern} ESCAPE '\\'`,
    sql`${searchDocuments.normalizedTags} LIKE ${pattern} ESCAPE '\\'`,
  );
  const where = and(matches, eq(posts.status, 'published'), eq(posts.visibility, 'public'));
  const rows = await db
    .select({ postId: searchDocuments.postId })
    .from(searchDocuments)
    .innerJoin(posts, eq(posts.id, searchDocuments.postId))
    .where(where)
    .orderBy(desc(searchDocuments.firstPublishedAt));
  const ids = rows.map((row) => row.postId);
  const offset = options.offset ?? 0;
  const limit = options.limit ?? ids.length;
  return { ids: ids.slice(offset, offset + limit), total: ids.length };
}
