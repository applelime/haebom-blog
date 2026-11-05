import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { schema } from './schema';

export type Db = LibSQLDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/** 저장소 함수는 데이터베이스나 진행 중인 트랜잭션 어느 쪽이든 받습니다. */
export type DbOrTx = Db | Tx;

export const DEFAULT_DATABASE_URL = 'file:data/blog.db';

/** schema.ts와 같은 모양의 표를 만듭니다. 이미 있으면 그대로 둡니다. */
export const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL DEFAULT '',
  topic TEXT NOT NULL DEFAULT 'daily' CHECK (topic IN ('travel', 'daily', 'taste', 'work')),
  tags TEXT NOT NULL DEFAULT '[]',
  blocks TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  cover_photo_id TEXT,
  dek TEXT,
  first_published_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS posts_listing_idx ON posts (status, visibility, first_published_at);
CREATE INDEX IF NOT EXISTS posts_topic_idx ON posts (topic);
CREATE TABLE IF NOT EXISTS post_revisions (
  post_id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  topic TEXT NOT NULL DEFAULT 'daily' CHECK (topic IN ('travel', 'daily', 'taste', 'work')),
  tags TEXT NOT NULL DEFAULT '[]',
  blocks TEXT NOT NULL DEFAULT '[]',
  cover_photo_id TEXT,
  dek TEXT,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  saved_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY NOT NULL,
  original_file TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('jpeg', 'png', 'heic', 'webp')),
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  size_bytes INTEGER NOT NULL,
  variants TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS search_documents (
  post_id TEXT PRIMARY KEY NOT NULL,
  normalized_title TEXT NOT NULL,
  normalized_text TEXT NOT NULL,
  normalized_tags TEXT NOT NULL,
  first_published_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS search_documents_date_idx ON search_documents (first_published_at);
`;

export interface Database {
  db: Db;
  client: Client;
  close(): void;
}

function ensureParentFolder(url: string): void {
  if (!url.startsWith('file:')) return;
  const filePath = url.slice('file:'.length);
  if (!filePath || filePath === ':memory:') return;
  mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
}

/**
 * 데이터베이스에 연결하고, 처음 실행이면 표를 만듭니다.
 * url을 주지 않으면 DATABASE_URL 환경 변수, 그것도 없으면 `file:data/blog.db`를 씁니다.
 */
export async function openDatabase(url = process.env.DATABASE_URL || DEFAULT_DATABASE_URL) {
  ensureParentFolder(url);
  const client = createClient({ url });
  try {
    // WAL은 파일에 남는 설정이라, 트랜잭션이 새 연결을 열어도 그대로 적용됩니다.
    await client.execute('PRAGMA journal_mode = WAL');
    await client.executeMultiple(CREATE_TABLES_SQL);
  } catch (error) {
    client.close();
    throw new Error(`데이터베이스를 열지 못했습니다 (${url})`, { cause: error });
  }
  const db = drizzle(client, { schema });
  const database: Database = { db, client, close: () => client.close() };
  return database;
}
