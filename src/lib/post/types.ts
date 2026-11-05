import type { Block } from './blocks';

export const TOPICS = ['travel', 'daily', 'taste', 'work'] as const;
export type Topic = (typeof TOPICS)[number];

export const TOPIC_LABELS: Record<Topic, string> = {
  travel: '여행',
  daily: '일상',
  taste: '취향',
  work: '일',
};

export const DEFAULT_TOPIC: Topic = 'daily';

export type PostStatus = 'draft' | 'published';
export type Visibility = 'public' | 'private';

/** 보는 사람. 글쓴이 컴퓨터(루프백)에서 온 요청만 author입니다(ADR-006). */
export type Viewer = 'author' | 'reader';

/** 에디터에서 고칠 수 있는 내용. 발행본(Post)과 작업 사본(PostRevision)이 같은 모양을 가집니다(ADR-005). */
export interface PostFields {
  title: string;
  topic: Topic;
  tags: string[];
  blocks: Block[];
  /** 직접 고른 대표 사진. null이면 첫 사진을 씁니다(FR8.1). */
  coverPhotoId: string | null;
  /** 직접 쓴 소개 문장. null이면 첫 글 블록의 첫 문장을 씁니다(FR8.1). */
  dek: string | null;
  visibility: Visibility;
}

export interface Post extends PostFields {
  id: string;
  slug: string;
  status: PostStatus;
  firstPublishedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface PostRevision extends PostFields {
  postId: string;
  savedAt: number;
}

export function isTopic(value: string): value is Topic {
  return (TOPICS as readonly string[]).includes(value);
}

export function isPubliclyVisible(post: Pick<Post, 'status' | 'visibility'>): boolean {
  return post.status === 'published' && post.visibility === 'public';
}
