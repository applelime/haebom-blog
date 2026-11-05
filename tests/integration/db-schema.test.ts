// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '@/lib/db/client';
import { openTempDatabase, type TempDatabase } from '../helpers/temp-db';

let database: TempDatabase | undefined;

afterEach(() => {
  database?.cleanup();
  database = undefined;
});

describe('데이터베이스 표 (ADR-002, ADR-005)', () => {
  it('처음 열면 posts, post_revisions, photos, search_documents 표를 만들고, 다시 열어도 망가지지 않는다', async () => {
    database = await openTempDatabase('schema');
    const result = await database.client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    );
    const names = result.rows.map((row) => row.name);
    expect(names).toEqual(
      expect.arrayContaining(['photos', 'post_revisions', 'posts', 'search_documents']),
    );

    await database.client.execute({
      sql: 'INSERT INTO posts (id, slug, created_at, updated_at) VALUES (?, ?, ?, ?)',
      args: ['p1', 'p1', 1, 1],
    });
    const reopened = await openDatabase(database.url);
    const count = await reopened.client.execute('SELECT COUNT(*) AS n FROM posts');
    reopened.close();
    expect(Number(count.rows[0].n)).toBe(1);
  });

  it('새 글의 기본값은 임시 저장, 공개, 빈 태그와 빈 블록이다', async () => {
    database = await openTempDatabase('schema-defaults');
    await database.client.execute({
      sql: 'INSERT INTO posts (id, slug, created_at, updated_at) VALUES (?, ?, ?, ?)',
      args: ['p1', 'p1', 1, 1],
    });
    const result = await database.client.execute('SELECT * FROM posts WHERE id = ?', ['p1']);
    const row = result.rows[0];
    expect(row.status).toBe('draft');
    expect(row.visibility).toBe('public');
    expect(row.topic).toBe('daily');
    expect(row.tags).toBe('[]');
    expect(row.blocks).toBe('[]');
    expect(row.first_published_at).toBeNull();

    await expect(
      database.client.execute({
        sql: "INSERT INTO posts (id, slug, status, created_at, updated_at) VALUES ('p2', 'p2', 'gone', 1, 1)",
        args: [],
      }),
    ).rejects.toThrow();
  });
});
