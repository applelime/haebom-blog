'use client';

import { useEffect, useRef } from 'react';
import { TOPICS, TOPIC_LABELS, type Topic } from '@/lib/post/types';
import { SITE_NAME } from '@/lib/site';
import { useModalDialog } from '../dialog/useModalDialog';

export interface IndexDialogProps {
  counts: Record<Topic, number>;
  focusSearch?: boolean;
  onClose: () => void;
}

/** 목차 창: 주제 4개와 글 수, 검색칸(FR9.1, FR10.1). */
export function IndexDialog({ counts, focusSearch = false, onClose }: IndexDialogProps) {
  const dialogRef = useModalDialog(onClose);
  const firstTopicRef = useRef<HTMLAnchorElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (focusSearch ? searchRef.current : firstTopicRef.current)?.focus();
  }, [focusSearch]);

  return (
    <dialog ref={dialogRef} className="full" aria-label="목차" data-testid="index-dialog">
      <div className="index-inner">
        <div className="index-top">
          <span className="wordmark">{SITE_NAME}</span>
          <button
            className="plain-btn"
            type="button"
            onClick={onClose}
            data-testid="index-dialog-close-button"
          >
            닫기
          </button>
        </div>
        <ul className="index-list">
          {TOPICS.map((topic, index) => (
            <li key={topic} data-topic={topic}>
              <a
                href={`/topics/${topic}`}
                ref={index === 0 ? firstTopicRef : undefined}
                data-testid={`index-dialog-topic-${topic}`}
              >
                <span className="t">{TOPIC_LABELS[topic]}</span>
                <span className="count">{counts[topic]}편</span>
              </a>
            </li>
          ))}
        </ul>
        <form action="/search" method="get" role="search">
          <label className="index-search">
            <span>검색</span>
            <input
              ref={searchRef}
              type="search"
              name="q"
              placeholder="찾고 싶은 단어"
              data-testid="index-dialog-search-input"
            />
          </label>
        </form>
      </div>
    </dialog>
  );
}
