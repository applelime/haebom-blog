import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { Block } from '../post/blocks';

/**
 * 데이터 표(ADR-002, ADR-005). 날짜는 모두 밀리초 단위 숫자입니다.
 * 표를 만드는 SQL은 client.ts의 CREATE_TABLES_SQL에 같은 모양으로 있습니다.
 */

export const posts = sqliteTable(
  'posts',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull().default(''),
    topic: text('topic', { enum: ['travel', 'daily', 'taste', 'work'] })
      .notNull()
      .default('daily'),
    tags: text('tags', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    blocks: text('blocks', { mode: 'json' })
      .$type<Block[]>()
      .notNull()
      .default(sql`'[]'`),
    status: text('status', { enum: ['draft', 'published'] })
      .notNull()
      .default('draft'),
    visibility: text('visibility', { enum: ['public', 'private'] })
      .notNull()
      .default('public'),
    coverPhotoId: text('cover_photo_id'),
    dek: text('dek'),
    firstPublishedAt: integer('first_published_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    index('posts_listing_idx').on(table.status, table.visibility, table.firstPublishedAt),
    index('posts_topic_idx').on(table.topic),
  ],
);

/** 발행한 글을 고치는 동안의 작업 사본. 글 하나에 최대 하나입니다(ADR-005). */
export const postRevisions = sqliteTable('post_revisions', {
  postId: text('post_id').primaryKey(),
  title: text('title').notNull().default(''),
  topic: text('topic', { enum: ['travel', 'daily', 'taste', 'work'] })
    .notNull()
    .default('daily'),
  tags: text('tags', { mode: 'json' })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`),
  blocks: text('blocks', { mode: 'json' })
    .$type<Block[]>()
    .notNull()
    .default(sql`'[]'`),
  coverPhotoId: text('cover_photo_id'),
  dek: text('dek'),
  visibility: text('visibility', { enum: ['public', 'private'] })
    .notNull()
    .default('public'),
  savedAt: integer('saved_at').notNull(),
});

/** 사진 정보(Media). 사진 설명은 블록 안에만 둡니다. */
export const photos = sqliteTable('photos', {
  id: text('id').primaryKey(),
  originalFile: text('original_file').notNull(),
  format: text('format', { enum: ['jpeg', 'png', 'heic', 'webp'] }).notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  variants: text('variants', { mode: 'json' }).$type<number[]>().notNull(),
  createdAt: integer('created_at').notNull(),
});

/** 검색용으로 정리한 글 내용(Search). 발행된 공개 글만 들어갑니다(ADR-007). */
export const searchDocuments = sqliteTable(
  'search_documents',
  {
    postId: text('post_id').primaryKey(),
    normalizedTitle: text('normalized_title').notNull(),
    normalizedText: text('normalized_text').notNull(),
    normalizedTags: text('normalized_tags').notNull(),
    firstPublishedAt: integer('first_published_at').notNull(),
  },
  (table) => [index('search_documents_date_idx').on(table.firstPublishedAt)],
);

export const schema = { posts, postRevisions, photos, searchDocuments };

export type PostRow = typeof posts.$inferSelect;
export type PostInsert = typeof posts.$inferInsert;
export type PostRevisionRow = typeof postRevisions.$inferSelect;
export type PhotoRow = typeof photos.$inferSelect;
export type SearchDocumentRow = typeof searchDocuments.$inferSelect;
