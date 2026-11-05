import { ListingView } from '@/components/reader/ListingView';
import { SEARCH_EMPTY_MESSAGE, SEARCH_PROMPT_MESSAGE } from '@/lib/messages';
import { firstParam, parsePageParam, type SearchParams } from '@/lib/params';
import { getRuntime } from '@/lib/runtime';

export const dynamic = 'force-dynamic';
export const metadata = { title: '검색' };

const MAX_QUERY_LENGTH = 100;

/** 검색 결과(FR10). 공개 글의 제목, 본문, 태그에서 찾습니다. */
export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query = firstParam(params.q).slice(0, MAX_QUERY_LENGTH);
  const page = parsePageParam(params.page);
  const { posts } = await getRuntime();
  const result = await posts.searchPublic(query, page);
  const hasQuery = result.query !== '';
  return (
    <ListingView
      title={hasQuery ? `‘${query.trim()}’ 검색 결과` : '검색'}
      label="검색 결과"
      cards={result.cards}
      total={result.total}
      page={result.page}
      pageCount={result.pageCount}
      emptyMessage={hasQuery ? SEARCH_EMPTY_MESSAGE : SEARCH_PROMPT_MESSAGE}
      pageHref={(number) => `/search?q=${encodeURIComponent(query)}&page=${number}`}
    >
      <form className="search-form" action="/search" method="get" role="search">
        <label>
          <span className="sr-only">검색어</span>
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="찾고 싶은 단어"
            data-testid="search-page-input"
          />
        </label>
      </form>
    </ListingView>
  );
}
