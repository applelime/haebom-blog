import { notFound } from 'next/navigation';
import { ArticleView } from '@/components/reader/ArticleView';
import { getViewer } from '@/lib/access/viewer';
import { decodeSegment } from '@/lib/params';
import { getRuntime } from '@/lib/runtime';

export const dynamic = 'force-dynamic';

type Params = Promise<{ slug: string }>;

async function loadArticle(params: Params) {
  const slug = decodeSegment((await params).slug);
  if (!slug) return null;
  const viewer = await getViewer();
  const { posts } = await getRuntime();
  const view = await posts.getArticle(slug, viewer);
  return view ? { view, viewer } : null;
}

export async function generateMetadata({ params }: { params: Params }) {
  const loaded = await loadArticle(params);
  if (!loaded) return { title: '글을 찾을 수 없습니다' };
  return { title: loaded.view.post.title || '제목 없는 글', description: loaded.view.dek };
}

/** 글 본문. 독자에게는 발행된 공개 글만 보이고, 나머지는 "글을 찾을 수 없습니다."입니다(FR5.3). */
export default async function ArticlePage({ params }: { params: Params }) {
  const loaded = await loadArticle(params);
  if (!loaded) notFound();
  const { view, viewer } = loaded;
  const { post } = view;
  return (
    <ArticleView
      title={post.title}
      topic={post.topic}
      dek={view.dek}
      date={post.firstPublishedAt}
      tags={post.tags}
      blocks={post.blocks}
      photos={view.photos}
      status={post.status}
      visibility={post.visibility}
      isAuthor={viewer === 'author'}
    />
  );
}
