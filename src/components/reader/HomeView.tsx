import Link from 'next/link';
import { formatDate } from '@/lib/format';
import { TOPIC_LABELS } from '@/lib/post/types';
import type { PostCard } from '@/lib/post/view';
import { HOME_EMPTY_MESSAGE } from '@/lib/messages';
import { SITE_NAME } from '@/lib/site';
import { Photo } from '../blocks/Photo';
import { EmptyState } from './EmptyState';
import { FeatureItem } from './FeatureItem';

/** 첫 화면(시안 A): 가장 최근 공개 글을 큰 표지로, 다음 두 편을 최신 글로(FR7). */
export function HomeView({ cover, latest }: { cover: PostCard | null; latest: PostCard[] }) {
  return (
    <section className="page" aria-label="첫 화면">
      <h1 className="sr-only">{SITE_NAME}</h1>
      {cover === null ? (
        <EmptyState message={HOME_EMPTY_MESSAGE} showHomeLink={false} />
      ) : (
        <>
          <a
            className="cover"
            href={`/posts/${encodeURIComponent(cover.slug)}`}
            data-topic={cover.topic}
            data-testid="home-cover"
          >
            {cover.cover && (
              <Photo
                photo={cover.cover}
                alt={cover.cover.alt}
                frameClassName="r-2x1"
                sizes="(max-width: 1280px) 100vw, 1280px"
                priority
              />
            )}
            <div className="cover-text">
              <div className="cover-meta">
                <span className="topic">{TOPIC_LABELS[cover.topic]}</span>
                {cover.date !== null && <span className="date">{formatDate(cover.date)}</span>}
              </div>
              <div className="cover-body">
                <h2>{cover.title}</h2>
                {cover.dek && <p className="dek">{cover.dek}</p>}
              </div>
            </div>
          </a>
          {latest.length > 0 && (
            <>
              <div className="latest-head">
                <h2>최신 글</h2>
                <Link href="/posts" data-testid="home-all-posts-link">
                  글 전체 보기
                </Link>
              </div>
              {latest.map((card, index) => (
                <FeatureItem key={card.id} card={card} flip={index % 2 === 1} />
              ))}
            </>
          )}
        </>
      )}
    </section>
  );
}
