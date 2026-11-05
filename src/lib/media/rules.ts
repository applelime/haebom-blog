import type { PhotoFormat } from './types';

/**
 * 사진 검사 규칙(FR3.1, FR3.2). 화면(에디터)과 서버가 같은 규칙을 씁니다.
 * 이 파일은 sharp 같은 서버 전용 모듈을 불러오지 않습니다.
 */

export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
export const VARIANT_WIDTHS = [480, 960, 1600, 2400] as const;
export type VariantWidth = (typeof VARIANT_WIDTHS)[number];

export const REASON_UNSUPPORTED_FORMAT = '지원하지 않는 형식입니다';
export const REASON_TOO_LARGE = '20MB를 넘습니다';
export const UPLOAD_FAILED_MESSAGE = '사진을 올리지 못했습니다.';

export const PHOTO_ACCEPT =
  '.jpg,.jpeg,.png,.heic,.heif,.webp,image/jpeg,image/png,image/heic,image/heif,image/webp';

const FORMAT_BY_EXTENSION: Record<string, PhotoFormat> = {
  jpg: 'jpeg',
  jpeg: 'jpeg',
  png: 'png',
  heic: 'heic',
  heif: 'heic',
  webp: 'webp',
};

const FORMAT_BY_MIME: Record<string, PhotoFormat> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/heif': 'heic',
  'image/webp': 'webp',
};

/** 이름이 없거나 형식을 알려주지 않는 브라우저도 있어서, 이 값들은 형식 정보가 없는 것으로 봅니다. */
const UNKNOWN_MIMES = new Set(['', 'application/octet-stream']);

export interface PhotoFileMeta {
  name: string;
  type: string;
  size: number;
}

export type PhotoCheck =
  | { ok: true; format: PhotoFormat }
  | { ok: false; fileName: string; reason: string; message: string };

function extensionOf(name: string): string | null {
  const match = /\.([A-Za-z0-9]+)$/.exec(name.trim());
  return match ? match[1].toLowerCase() : null;
}

/** 파일 이름과 형식 정보로 사진 형식을 정합니다. 받을 수 없는 형식이면 null입니다. */
export function detectDeclaredFormat(name: string, mimeType: string): PhotoFormat | null {
  const mime = mimeType.toLowerCase();
  const fromMime = FORMAT_BY_MIME[mime] ?? null;
  if (!UNKNOWN_MIMES.has(mime) && !fromMime) return null;
  const extension = extensionOf(name);
  if (extension) return FORMAT_BY_EXTENSION[extension] ?? null;
  return fromMime;
}

function rejection(fileName: string, reason: string): PhotoCheck {
  return { ok: false, fileName, reason, message: `${fileName}: ${reason}.` };
}

/** 올리기 전 검사: 형식(JPG, PNG, HEIC, WebP)과 크기(20MB). */
export function checkPhotoFile(file: PhotoFileMeta): PhotoCheck {
  const format = detectDeclaredFormat(file.name, file.type);
  if (!format) return rejection(file.name, REASON_UNSUPPORTED_FORMAT);
  if (file.size > MAX_PHOTO_BYTES) return rejection(file.name, REASON_TOO_LARGE);
  return { ok: true, format };
}

export function isVariantWidth(value: number): value is VariantWidth {
  return (VARIANT_WIDTHS as readonly number[]).includes(value);
}

/** 화면 크기별 사진 주소(srcset). 원본 주소는 만들지 않습니다. */
export function photoUrl(photoId: string, width: VariantWidth): string {
  return `/media/${encodeURIComponent(photoId)}/${width}`;
}

export function photoSrcSet(photoId: string): string {
  return VARIANT_WIDTHS.map((width) => `${photoUrl(photoId, width)} ${width}w`).join(', ');
}
