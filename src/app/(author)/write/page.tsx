import { notFound } from 'next/navigation';
import { PostsList } from '@/components/posts/PostsList';
import { getViewer } from '@/lib/access/viewer';
import { getRuntime } from '@/lib/runtime';
import { createPostAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: '내 글', robots: { index: false } };

/** 내 글 목록. 글쓴이 컴퓨터(localhost)가 아니면 "글을 찾을 수 없습니다."입니다(FR5.4). */
export default async function MyPostsPage() {
  if ((await getViewer()) !== 'author') notFound();
  const { posts } = await getRuntime();
  const rows = await posts.listForAuthor();
  const items = rows.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    visibility: row.visibility,
    hasRevision: row.hasRevision,
    updatedAt: row.updatedAt,
  }));
  return (
    <main>
      <PostsList posts={items} onNew={createPostAction} />
    </main>
  );
}
