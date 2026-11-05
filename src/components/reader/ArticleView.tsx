import { formatDate } from '@/lib/format';
import type { PhotoInfo } from '@/lib/media/types';
import type { Block } from '@/lib/post/blocks';
import { TOPIC_LABELS, type PostStatus, type Topic, type Visibility } from '@/lib/post/types';
import { BlockList } from '../blocks/BlockList';

export interface ArticleViewProps {
  title: string;
  topic: Topic;
  dek: string;
  date: number | null;
  tags: string[];
  blocks: Block[];
  photos: Record<string, PhotoInfo>;
  status: PostStatus;
  visibility: Visibility;
  /** 글쓴이가 보면 비공개 글, 임시 저장 글 표시를 붙입니다(FR5.3). */
  isAuthor: boolean;
  showShortfall?: boolean;
}

/** 글 본문: 주제, 제목, 소개 문장, 날짜, 블록, 태그(FR1.1). */
export function ArticleView(props: ArticleViewProps) {
  const { title, topic, dek, date, tags, blocks, photos, isAuthor } = props;
  const flags: string[] = [];
  if (isAuthor && props.status === 'draft') flags.push('임시 저장 글');
  if (isAuthor && props.status === 'published' && props.visibility === 'private')
    flags.push('비공개 글');

  return (
    <article data-topic={topic} className="page" data-testid="article">
      <header className="article-head">
        {flags.length > 0 && (
          <div className="flags">
            {flags.map((flag) => (
              <span key={flag} className="private-flag" data-testid="article-flag">
                {flag}
              </span>
            ))}
          </div>
        )}
        <a className="topic" href={`/topics/${topic}`} data-testid="article-topic-link">
          {TOPIC_LABELS[topic]}
        </a>
        <h1>{title}</h1>
        {dek && <p className="dek">{dek}</p>}
        {date !== null && <p className="date">{formatDate(date)}</p>}
      </header>
      <BlockList
        blocks={blocks}
        photos={photos}
        postTitle={title}
        showShortfall={props.showShortfall}
      />
      {tags.length > 0 && (
        <div className="prose">
          <div className="tags">
            {tags.map((tag) => (
              <a key={tag} href={`/tags/${encodeURIComponent(tag)}`} data-testid="article-tag-link">
                #{tag}
              </a>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
