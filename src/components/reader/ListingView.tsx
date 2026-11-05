import type { ReactNode } from 'react';
import type { Topic } from '@/lib/post/types';
import type { PostCard } from '@/lib/post/view';
import { EmptyState } from './EmptyState';
import { FeatureItem } from './FeatureItem';

export interface ListingViewProps {
  title: string;
  label: string;
  cards: PostCard[];
  total: number;
  page: number;
  pageCount: number;
  emptyMessage: string;
  /** 쪽 번호 주소 만들기 */
  pageHref: (page: number) => string;
  topic?: Topic;
  /** 제목 아래에 넣을 내용(검색칸 등) */
  children?: ReactNode;
}

function Pagination({
  page,
  pageCount,
  pageHref,
}: Pick<ListingViewProps, 'page' | 'pageCount' | 'pageHref'>) {
  if (pageCount <= 1) return null;
  return (
    <nav className="pagination" aria-label="쪽 번호" data-testid="pagination">
      {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => (
        <a
          key={number}
          href={pageHref(number)}
          aria-current={number === page ? 'page' : undefined}
          data-testid={`pagination-page-${number}`}
        >
          {number}
        </a>
      ))}
    </nav>
  );
}

/** 모아보기와 검색 결과: 첫 화면의 최신 글 배치를 한 쪽 12개까지 이어 씁니다(FR9, FR10). */
export function ListingView(props: ListingViewProps) {
  const { title, label, cards, total, emptyMessage, topic, children } = props;
  return (
    <section className="page" aria-label={label}>
      <header className="listing-head" data-topic={topic}>
        <h1>{title}</h1>
        {total > 0 && <span className="count">글 {total}편</span>}
        {children}
      </header>
      {cards.length === 0 ? (
        <EmptyState message={emptyMessage} />
      ) : (
        cards.map((card, index) => <FeatureItem key={card.id} card={card} flip={index % 2 === 1} />)
      )}
      <Pagination page={props.page} pageCount={props.pageCount} pageHref={props.pageHref} />
    </section>
  );
}
