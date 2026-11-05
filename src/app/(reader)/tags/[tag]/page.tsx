import { notFound } from 'next/navigation';
import { ListingView } from '@/components/reader/ListingView';
import { TAG_EMPTY_MESSAGE } from '@/lib/messages';
import { decodeSegment, parsePageParam, type SearchParams } from '@/lib/params';
import { getRuntime } from '@/lib/runtime';

export const dynamic = 'force-dynamic';

type Params = Promise<{ tag: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const tag = decodeSegment((await params).tag);
  return { title: tag ? `#${tag}` : '글을 찾을 수 없습니다' };
}

/** 태그 모아보기(FR1.4, FR9.2, FR9.3). */
export default async function TagPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const tag = decodeSegment((await params).tag);
  if (!tag || tag.length > 30) notFound();
  const page = parsePageParam((await searchParams).page);
  const { posts } = await getRuntime();
  const result = await posts.listPublic({ tag, page });
  return (
    <ListingView
      title={`#${tag}`}
      label={`${tag} 태그의 글`}
      cards={result.cards}
      total={result.total}
      page={result.page}
      pageCount={result.pageCount}
      emptyMessage={TAG_EMPTY_MESSAGE}
      pageHref={(number) => `/tags/${encodeURIComponent(tag)}?page=${number}`}
    />
  );
}
