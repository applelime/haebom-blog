'use client';

import Link from 'next/link';
import { useRef, useState, useTransition, type KeyboardEvent } from 'react';
import { formatShortDate } from '@/lib/format';
import type { PostStatus, Visibility } from '@/lib/post/types';

export interface PostsListItem {
  id: string;
  title: string;
  status: PostStatus;
  visibility: Visibility;
  hasRevision: boolean;
  updatedAt: number;
}

export type PostsTab = 'drafts' | 'private' | 'published';

const TABS: { id: PostsTab; label: string; empty: string }[] = [
  { id: 'drafts', label: '임시 저장', empty: '임시 저장한 글이 없습니다.' },
  { id: 'private', label: '비공개', empty: '비공개 글이 없습니다.' },
  { id: 'published', label: '공개', empty: '공개한 글이 없습니다.' },
];

/** 글이 들어갈 탭. 고치는 중인 발행 글은 원래 탭(공개 또는 비공개)에 둡니다(FR4.5). */
export function tabOf(post: Pick<PostsListItem, 'status' | 'visibility'>): PostsTab {
  if (post.status === 'draft') return 'drafts';
  return post.visibility === 'private' ? 'private' : 'published';
}

function stateLabel(post: PostsListItem): { text: string; editing: boolean } {
  if (post.status === 'draft') return { text: '임시 저장', editing: false };
  const base = post.visibility === 'private' ? '비공개' : '공개';
  return post.hasRevision
    ? { text: `${base} 글, 고치는 중`, editing: true }
    : { text: base, editing: false };
}

/** 내 글 목록: 임시 저장, 비공개, 공개 탭(FR6). 처음에는 임시 저장 탭이 열립니다. */
export function PostsList({
  posts,
  onNew,
}: {
  posts: PostsListItem[];
  onNew: () => void | Promise<void>;
}) {
  const [selected, setSelected] = useState<PostsTab>('drafts');
  const [isCreating, startCreating] = useTransition();
  const tabRefs = useRef<Record<PostsTab, HTMLButtonElement | null>>({
    drafts: null,
    private: null,
    published: null,
  });
  const counts = Object.fromEntries(
    TABS.map((tab) => [tab.id, posts.filter((post) => tabOf(post) === tab.id).length]),
  ) as Record<PostsTab, number>;
  const visible = posts.filter((post) => tabOf(post) === selected);
  const current = TABS.find((tab) => tab.id === selected)!;

  function createPost() {
    startCreating(async () => {
      await onNew();
    });
  }

  function handleTabKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const index = TABS.findIndex((tab) => tab.id === selected);
    const next = TABS[(index + (event.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
    setSelected(next.id);
    tabRefs.current[next.id]?.focus();
  }

  const newButton = (testId: string) => (
    <button
      className="btn solid"
      type="button"
      disabled={isCreating}
      onClick={createPost}
      data-testid={testId}
    >
      새 글 쓰기
    </button>
  );

  return (
    <section className="page" aria-label="내 글 목록">
      <div className="posts-top">
        <Link href="/" data-testid="posts-home-link">
          블로그 첫 화면
        </Link>
      </div>
      <div className="posts-head">
        <h1>내 글</h1>
        {newButton('posts-new-button')}
      </div>
      <div className="tabs" role="tablist" aria-label="글 상태" onKeyDown={handleTabKey}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            ref={(element) => {
              tabRefs.current[tab.id] = element;
            }}
            id={`posts-tab-${tab.id}`}
            role="tab"
            type="button"
            aria-selected={selected === tab.id}
            aria-controls="posts-tabpanel"
            tabIndex={selected === tab.id ? 0 : -1}
            onClick={() => setSelected(tab.id)}
            data-testid={`posts-tab-${tab.id}`}
          >
            {tab.label} {counts[tab.id]}
          </button>
        ))}
      </div>
      <div id="posts-tabpanel" role="tabpanel" aria-labelledby={`posts-tab-${selected}`}>
        {visible.length === 0 ? (
          <div className="tab-empty" data-testid="posts-empty">
            <p>{current.empty}</p>
            {newButton('posts-empty-new-button')}
          </div>
        ) : (
          visible.map((post) => {
            const state = stateLabel(post);
            return (
              <a
                className="post-row"
                key={post.id}
                href={`/write/${post.id}`}
                data-testid="posts-row"
              >
                <span className="ttl">{post.title.trim() || '제목 없는 글'}</span>
                <span className={`state${state.editing ? ' editing' : ''}`}>{state.text}</span>
                <span className="date">{formatShortDate(post.updatedAt)}</span>
              </a>
            );
          })
        )}
      </div>
    </section>
  );
}
