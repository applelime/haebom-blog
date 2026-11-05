import type { PhotoInfo } from '../media/types';
import { isPhotoBlock, type Block } from './blocks';
import type { Post, PostFields, Topic } from './types';

/** 대표 사진과 소개 문장을 정하는 규칙(FR8.1~FR8.3). */

const MAX_AUTO_DEK_LENGTH = 160;

/** 글의 첫 문장. 마침표, 물음표, 느낌표에서 끊고, 없으면 첫 줄을 씁니다. */
export function firstSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  const firstLine = trimmed.split(/\n/)[0].trim();
  const match = /^.+?[.!?。](?=\s|$)/u.exec(firstLine);
  const sentence = match ? match[0] : firstLine;
  return sentence.length > MAX_AUTO_DEK_LENGTH
    ? `${sentence.slice(0, MAX_AUTO_DEK_LENGTH - 1)}…`
    : sentence;
}

function findPhotoCaption(blocks: Block[], photoId: string): string {
  for (const block of blocks) {
    if (!isPhotoBlock(block)) continue;
    const photo = block.photos.find((item) => item.photoId === photoId);
    if (photo) return photo.caption;
  }
  return '';
}

/** 직접 고른 대표 사진이 있으면 그 사진, 없으면 본문의 첫 사진. 사진이 없으면 null입니다. */
export function resolveCoverPhotoId(
  fields: Pick<PostFields, 'blocks' | 'coverPhotoId'>,
): string | null {
  if (fields.coverPhotoId) return fields.coverPhotoId;
  for (const block of fields.blocks) {
    if (isPhotoBlock(block) && block.photos.length > 0) return block.photos[0].photoId;
  }
  return null;
}

/** 직접 쓴 소개 문장이 있으면 그 문장, 없으면 첫 글 블록의 첫 문장입니다. */
export function resolveDek(fields: Pick<PostFields, 'blocks' | 'dek'>): string {
  if (fields.dek && fields.dek.trim()) return fields.dek.trim();
  for (const block of fields.blocks) {
    if (block.type === 'text' && block.text.trim()) return firstSentence(block.text);
  }
  return '';
}

/** 사진 대체 텍스트: 사진 설명이 비면 글 제목으로 대신합니다(NFR3). */
export function altText(caption: string, postTitle: string): string {
  return caption.trim() || postTitle.trim() || '사진';
}

export interface CoverPhoto extends PhotoInfo {
  alt: string;
}

export interface PostCard {
  id: string;
  slug: string;
  title: string;
  topic: Topic;
  dek: string;
  date: number | null;
  cover: CoverPhoto | null;
}

export function toPostCard(post: Post, photos: Map<string, PhotoInfo>): PostCard {
  const coverId = resolveCoverPhotoId(post);
  const info = coverId ? photos.get(coverId) : undefined;
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    topic: post.topic,
    dek: resolveDek(post),
    date: post.firstPublishedAt,
    cover: info
      ? { ...info, alt: altText(findPhotoCaption(post.blocks, info.id), post.title) }
      : null,
  };
}
