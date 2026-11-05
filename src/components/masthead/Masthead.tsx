'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Topic } from '@/lib/post/types';
import { SITE_NAME } from '@/lib/site';
import { IndexDialog } from './IndexDialog';

export interface MastheadProps {
  /** 글쓴이 컴퓨터(localhost)에서 열었을 때만 true. 글쓰기 링크를 보여줍니다(FR5.4). */
  isAuthor: boolean;
  topicCounts: Record<Topic, number>;
}

/** 공통 머리말: 가운데 제호, 왼쪽 "목차", 오른쪽 "검색"과 "글쓰기". */
export function Masthead({ isAuthor, topicCounts }: MastheadProps) {
  const [dialog, setDialog] = useState<'closed' | 'index' | 'search'>('closed');

  return (
    <>
      <header className="page masthead">
        <div className="left">
          <button
            className="plain-btn"
            type="button"
            aria-haspopup="dialog"
            onClick={() => setDialog('index')}
            data-testid="masthead-index-button"
          >
            목차
          </button>
        </div>
        <div className="wordmark-wrap">
          <Link className="wordmark" href="/" data-testid="masthead-home-link">
            {SITE_NAME}
          </Link>
        </div>
        <div className="right">
          <button
            className="plain-btn search-link"
            type="button"
            aria-haspopup="dialog"
            onClick={() => setDialog('search')}
            data-testid="masthead-search-button"
          >
            검색
          </button>
          {isAuthor && (
            <Link className="write-link" href="/write" data-testid="masthead-write-link">
              글쓰기
            </Link>
          )}
        </div>
      </header>
      {dialog !== 'closed' && (
        <IndexDialog
          counts={topicCounts}
          focusSearch={dialog === 'search'}
          onClose={() => setDialog('closed')}
        />
      )}
    </>
  );
}
