import { mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import sharp from 'sharp';
import { ID_PATTERN } from '../post/blocks';
import {
  checkPhotoFile,
  REASON_UNSUPPORTED_FORMAT,
  VARIANT_WIDTHS,
  type PhotoFileMeta,
  type VariantWidth,
} from './rules';
import type { PhotoFormat, PhotoRecord } from './types';

/**
 * Media: 사진 검사, 원본 보관, 크기별 WebP 만들기, 지우기(ADR-003).
 * 파일 이름은 받은 이름을 쓰지 않고 새 id로 정합니다.
 */

export class PhotoValidationError extends Error {
  constructor(
    public readonly fileName: string,
    public readonly reason: string,
  ) {
    super(`${fileName}: ${reason}.`);
    this.name = 'PhotoValidationError';
  }
}

export class PhotoProcessingError extends Error {
  constructor(
    public readonly fileName: string,
    options?: { cause?: unknown },
  ) {
    super(`사진을 처리하지 못했습니다: ${fileName}`, options);
    this.name = 'PhotoProcessingError';
  }
}

export interface IncomingPhoto extends PhotoFileMeta {
  data: Buffer;
}

export interface MediaServiceOptions {
  uploadDir: string;
  now?: () => number;
  createId?: () => string;
  /** HEIC를 JPEG로 바꾸는 함수. 기본은 heic-convert입니다. */
  convertHeic?: (input: Buffer) => Promise<Buffer>;
}

const ORIGINAL_EXTENSIONS: Record<PhotoFormat, string> = {
  jpeg: 'jpg',
  png: 'png',
  heic: 'heic',
  webp: 'webp',
};

const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1']);

/** 파일 앞부분으로 실제 형식을 확인합니다. 이름만 바꾼 다른 파일을 막기 위해서입니다. */
export function sniffPhotoFormat(data: Buffer): PhotoFormat | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'jpeg';
  if (
    data.length >= 8 &&
    data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'png';
  }
  if (
    data.length >= 12 &&
    data.toString('ascii', 0, 4) === 'RIFF' &&
    data.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  if (data.length >= 12 && data.toString('ascii', 4, 8) === 'ftyp') {
    const brand = data.toString('ascii', 8, 12);
    if (HEIF_BRANDS.has(brand)) return 'heic';
  }
  return null;
}

async function defaultConvertHeic(input: Buffer): Promise<Buffer> {
  const { default: convert } = await import('heic-convert');
  const output = await convert({ buffer: input, format: 'JPEG', quality: 0.92 });
  return Buffer.from(output);
}

/** 임시 이름으로 다 쓴 뒤 이름을 바꿔서, 반쯤 쓴 파일이 최종 이름으로 남지 않게 합니다. */
async function writeFileAtomically(finalPath: string, data: Buffer): Promise<void> {
  const tempPath = `${finalPath}.${nanoid(6)}.tmp`;
  try {
    await writeFile(tempPath, data);
    await rename(tempPath, finalPath);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}

function orientedSize(metadata: sharp.Metadata): { width: number; height: number } {
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const rotated = (metadata.orientation ?? 1) >= 5;
  return rotated ? { width: height, height: width } : { width, height };
}

export function createMediaService(options: MediaServiceOptions) {
  const uploadDir = path.resolve(options.uploadDir);
  const originalsDir = path.join(uploadDir, 'originals');
  const variantsDir = path.join(uploadDir, 'variants');
  const now = options.now ?? Date.now;
  const createId = options.createId ?? (() => nanoid(16));
  const convertHeic = options.convertHeic ?? defaultConvertHeic;

  function variantFilePath(photoId: string, width: VariantWidth): string {
    if (!ID_PATTERN.test(photoId)) throw new Error('알 수 없는 사진 id입니다');
    return path.join(variantsDir, `${photoId}-${width}.webp`);
  }

  function check(file: PhotoFileMeta): PhotoFormat {
    const result = checkPhotoFile(file);
    if (!result.ok) throw new PhotoValidationError(result.fileName, result.reason);
    return result.format;
  }

  async function writeVariants(photoId: string, decoded: Buffer, written: string[]) {
    for (const width of VARIANT_WIDTHS) {
      const output = await sharp(decoded)
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
      const target = variantFilePath(photoId, width);
      written.push(target);
      await writeFileAtomically(target, output);
    }
  }

  /** 사진 한 장을 검사하고, 원본과 크기별 WebP를 저장합니다. 실패하면 이 사진의 파일을 모두 지웁니다. */
  async function process(file: IncomingPhoto): Promise<PhotoRecord> {
    const declared = check(file);
    const actual = sniffPhotoFormat(file.data);
    if (!actual || actual !== declared) {
      throw new PhotoValidationError(file.name, REASON_UNSUPPORTED_FORMAT);
    }
    const id = createId();
    const originalFile = `${id}.${ORIGINAL_EXTENSIONS[actual]}`;
    const written: string[] = [];
    try {
      await mkdir(originalsDir, { recursive: true });
      await mkdir(variantsDir, { recursive: true });
      const decoded = actual === 'heic' ? await convertHeic(file.data) : file.data;
      const metadata = await sharp(decoded).metadata();
      const size = orientedSize(metadata);
      if (!size.width || !size.height) throw new Error('사진 크기를 읽지 못했습니다');
      const originalPath = path.join(originalsDir, originalFile);
      written.push(originalPath);
      await writeFileAtomically(originalPath, file.data);
      await writeVariants(id, decoded, written);
      return {
        id,
        originalFile,
        format: actual,
        width: size.width,
        height: size.height,
        sizeBytes: file.data.length,
        variants: [...VARIANT_WIDTHS],
        createdAt: now(),
      };
    } catch (error) {
      await Promise.all(written.map((target) => rm(target, { force: true })));
      throw new PhotoProcessingError(file.name, { cause: error });
    }
  }

  async function removeMatching(dir: string, prefix: string): Promise<void> {
    let names: string[];
    try {
      names = await readdir(dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    await Promise.all(
      names
        .filter((name) => name.startsWith(prefix))
        .map((name) => rm(path.join(dir, name), { force: true })),
    );
  }

  /** 사진 파일(원본과 크기별 사진)을 지웁니다. 데이터베이스에서 먼저 지운 뒤 부릅니다. */
  async function deleteFiles(photoIds: string[]): Promise<void> {
    for (const photoId of photoIds) {
      if (!ID_PATTERN.test(photoId)) continue;
      await removeMatching(originalsDir, `${photoId}.`);
      await removeMatching(variantsDir, `${photoId}-`);
    }
  }

  return { uploadDir, originalsDir, variantsDir, check, process, deleteFiles, variantFilePath };
}

export type MediaService = ReturnType<typeof createMediaService>;
