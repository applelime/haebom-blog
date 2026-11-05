import type { PhotoInfo } from '@/lib/media/types';
import type { PostFields } from '@/lib/post/types';

/** 에디터와 서버 액션이 주고받는 값. 화면 코드에서 서버 모듈을 불러오지 않도록 따로 둡니다. */

export type SaveResult =
  { ok: true; savedAt: number; hasPendingEdits: boolean } | { ok: false; message: string };

export type PublishActionResult =
  | { ok: true; slug: string }
  | { ok: false; message: string; reason: 'title-required' | 'blocks-required' | 'failed' };

export type DiscardResult = { ok: true; fields: PostFields } | { ok: false; message: string };

export interface EditorActions {
  save(fields: PostFields): Promise<SaveResult>;
  publish(fields: PostFields): Promise<PublishActionResult>;
  discard(): Promise<DiscardResult>;
  remove(): Promise<void>;
}

export type UploadResult =
  | { ok: true; photo: PhotoInfo }
  | { ok: false; kind: 'invalid'; message: string }
  | { ok: false; kind: 'failed'; message: string };

export type UploadPhoto = (file: File) => Promise<UploadResult>;
