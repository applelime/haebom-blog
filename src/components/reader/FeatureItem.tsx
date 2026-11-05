import { formatDate } from '@/lib/format';
import { TOPIC_LABELS } from '@/lib/post/types';
import type { PostCard } from '@/lib/post/view';
import { Photo } from '../blocks/Photo';

/** 최신 글 항목: 사진과 발췌문을 좌우로 둡니다. 첫 화면, 모아보기, 검색 결과에서 씁니다. */
export function FeatureItem({ card, flip = false }: { card: PostCard; flip?: boolean }) {
  const classes = ['feature', flip ? 'flip' : '', card.cover ? '' : 'no-photo']
    .filter(Boolean)
    .join(' ');
  return (
    <a
      className={classes}
      href={`/posts/${encodeURIComponent(card.slug)}`}
      data-topic={card.topic}
      data-testid="post-card"
    >
      {card.cover && (
        <Photo
          photo={card.cover}
          alt={card.cover.alt}
          frameClassName="r-3x2"
          sizes="(max-width: 767px) 100vw, 720px"
        />
      )}
      <div className="txt">
        <span className="topic">{TOPIC_LABELS[card.topic]}</span>
        <h3>{card.title}</h3>
        {card.dek && <p className="excerpt">{card.dek}</p>}
        {card.date !== null && <span className="date">{formatDate(card.date)}</span>}
      </div>
    </a>
  );
}
