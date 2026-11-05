import { ListingView } from '@/components/reader/ListingView';
import { HOME_EMPTY_MESSAGE } from '@/lib/messages';
import { parsePageParam, type SearchParams } from '@/lib/params';
import { getRuntime } from '@/lib/runtime';

export const dynamic = 'force-dynamic';
export const metadata = { title: '글 전체' };

/** "글 전체 보기": 주제 없는 모아보기. */
export default async function AllPostsPage({ searchParams }: { searchParams: SearchParams }) {
  const page = parsePageParam((await searchParams).page);
  const { posts } = await getRuntime();
  const result = await posts.listPublic({ page });
  return (
    <ListingView
      title="글 전체"
      label="글 전체"
      cards={result.cards}
      total={result.total}
      page={result.page}
      pageCount={result.pageCount}
      emptyMessage={HOME_EMPTY_MESSAGE}
      pageHref={(number) => `/posts?page=${number}`}
    />
  );
}
