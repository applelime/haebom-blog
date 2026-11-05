import { notFound } from 'next/navigation';
import { ListingView } from '@/components/reader/ListingView';
import { parsePageParam, type SearchParams } from '@/lib/params';
import { isTopic, TOPIC_LABELS } from '@/lib/post/types';
import { TOPIC_EMPTY_MESSAGE } from '@/lib/messages';
import { getRuntime } from '@/lib/runtime';

export const dynamic = 'force-dynamic';

type Params = Promise<{ topic: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { topic } = await params;
  return { title: isTopic(topic) ? TOPIC_LABELS[topic] : '글을 찾을 수 없습니다' };
}

/** 주제 모아보기(FR9.1, FR9.3, FR9.4). */
export default async function TopicPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { topic } = await params;
  if (!isTopic(topic)) notFound();
  const page = parsePageParam((await searchParams).page);
  const { posts } = await getRuntime();
  const result = await posts.listPublic({ topic, page });
  return (
    <ListingView
      title={TOPIC_LABELS[topic]}
      label={`${TOPIC_LABELS[topic]} 주제의 글`}
      topic={topic}
      cards={result.cards}
      total={result.total}
      page={result.page}
      pageCount={result.pageCount}
      emptyMessage={TOPIC_EMPTY_MESSAGE}
      pageHref={(number) => `/topics/${topic}?page=${number}`}
    />
  );
}
