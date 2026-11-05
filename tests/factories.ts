import type { Block, BlockPhoto } from '@/lib/post/blocks';
import type { PostFields } from '@/lib/post/types';

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}${counter}`;
}

export function photoRef(photoId = nextId('ph'), caption = ''): BlockPhoto {
  return { photoId, caption };
}

export function textBlock(text: string, heading = ''): Block {
  return { id: nextId('b'), type: 'text', heading, text };
}

export function quoteBlock(text: string): Block {
  return { id: nextId('b'), type: 'quote', text };
}

export function fullBlock(photo = photoRef()): Block {
  return { id: nextId('b'), type: 'photo-full', photos: [photo], caption: '' };
}

export function bodyBlock(photo = photoRef(), caption = ''): Block {
  return { id: nextId('b'), type: 'photo-body', photos: [photo], caption };
}

export function rowBlock(photos = [photoRef(), photoRef(), photoRef()], caption = ''): Block {
  return { id: nextId('b'), type: 'photo-row', photos, caption };
}

export function sideBlock(photo = photoRef(), text = '사진 옆의 글', reversed = false): Block {
  return {
    id: nextId('b'),
    type: 'photo-side',
    photos: [photo],
    caption: '',
    heading: '',
    text,
    reversed,
  };
}

export function galleryBlock(count = 6, caption = ''): Block {
  return {
    id: nextId('b'),
    type: 'photo-gallery',
    photos: Array.from({ length: count }, () => photoRef()),
    caption,
  };
}

/** 저장할 수 있는 글 내용. 필요한 칸만 바꿔 씁니다. */
export function postFields(overrides: Partial<PostFields> = {}): PostFields {
  return {
    title: '리스본, 노란 트램을 따라 걸은 사흘',
    topic: 'travel',
    tags: ['리스본', '트램'],
    blocks: [textBlock('첫날 아침, 숙소 앞 정류장에서 28번 트램을 기다렸다. 오르막은 가팔랐다.')],
    coverPhotoId: null,
    dek: null,
    visibility: 'public',
    ...overrides,
  };
}
