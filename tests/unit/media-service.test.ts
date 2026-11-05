// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkPhotoFile, MAX_PHOTO_BYTES, VARIANT_WIDTHS } from '@/lib/media/rules';
import {
  createMediaService,
  PhotoProcessingError,
  PhotoValidationError,
  type MediaService,
} from '@/lib/media/service';
import { makeTempDir } from '../helpers/temp-dir';

let temp: ReturnType<typeof makeTempDir>;
let media: MediaService;

async function makeJpeg(width = 3000, height = 2000): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 170, b: 60 } } })
    .jpeg({ quality: 70 })
    .toBuffer();
}

function filesIn(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir) : [];
}

beforeEach(() => {
  temp = makeTempDir('media');
  let sequence = 0;
  media = createMediaService({
    uploadDir: temp.dir,
    createId: () => `photo${(sequence += 1)}`,
    now: () => 42,
  });
});

afterEach(() => {
  temp.remove();
});

describe('Media 사진 처리 (FR3, ADR-003)', () => {
  it('20MB를 넘는 사진은 파일 이름과 "20MB를 넘습니다"를 돌려주며 거절한다', () => {
    const result = checkPhotoFile({
      name: 'DSC_0102.jpg',
      type: 'image/jpeg',
      size: MAX_PHOTO_BYTES + 1,
    });
    expect(result).toEqual({
      ok: false,
      fileName: 'DSC_0102.jpg',
      reason: '20MB를 넘습니다',
      message: 'DSC_0102.jpg: 20MB를 넘습니다.',
    });
    expect(() =>
      media.check({ name: 'DSC_0102.jpg', type: 'image/jpeg', size: MAX_PHOTO_BYTES + 1 }),
    ).toThrow(PhotoValidationError);
    expect(checkPhotoFile({ name: 'ok.jpg', type: 'image/jpeg', size: MAX_PHOTO_BYTES }).ok).toBe(
      true,
    );
  });

  it('JPG, PNG, HEIC, WebP가 아니면 "지원하지 않는 형식입니다"로 거절한다 (이름만 바꾼 파일도)', async () => {
    const movie = checkPhotoFile({ name: 'IMG_2041.mov', type: 'video/quicktime', size: 10 });
    expect(movie.ok === false && movie.message).toBe('IMG_2041.mov: 지원하지 않는 형식입니다.');
    for (const name of ['a.jpg', 'b.PNG', 'c.heic', 'd.webp']) {
      expect(checkPhotoFile({ name, type: '', size: 10 }).ok).toBe(true);
    }
    const fake = media.process({
      name: 'renamed.jpg',
      type: 'image/jpeg',
      size: 11,
      data: Buffer.from('hello world'),
    });
    await expect(fake).rejects.toMatchObject({ reason: '지원하지 않는 형식입니다' });
    expect(filesIn(media.originalsDir)).toHaveLength(0);
  });

  it('JPG를 처리하면 폭 480, 960, 1600, 2400의 WebP 4종을 만든다', async () => {
    const data = await makeJpeg();
    const photo = await media.process({
      name: 'lisbon.jpg',
      type: 'image/jpeg',
      size: data.length,
      data,
    });
    expect(photo).toMatchObject({
      id: 'photo1',
      format: 'jpeg',
      width: 3000,
      height: 2000,
      variants: [...VARIANT_WIDTHS],
    });
    for (const width of VARIANT_WIDTHS) {
      const meta = await sharp(media.variantFilePath(photo.id, width)).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.width).toBe(width);
    }
    expect(filesIn(media.variantsDir).sort()).toEqual(
      VARIANT_WIDTHS.map((width) => `photo1-${width}.webp`).sort(),
    );
  });

  it('원본은 받은 그대로 새 id 이름으로 보관한다 (FR3.4)', async () => {
    const data = await makeJpeg(800, 600);
    const photo = await media.process({
      name: '../../etc/passwd.jpg',
      type: 'image/jpeg',
      size: data.length,
      data,
    });
    expect(photo.originalFile).toBe('photo1.jpg');
    const stored = readFileSync(path.join(media.originalsDir, photo.originalFile));
    expect(stored.equals(data)).toBe(true);
  });

  it('처리 중 실패하면 반쯤 쓴 파일이나 임시 파일을 남기지 않는다', async () => {
    const broken = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);
    await expect(
      media.process({ name: 'broken.jpg', type: 'image/jpeg', size: broken.length, data: broken }),
    ).rejects.toBeInstanceOf(PhotoProcessingError);
    expect(filesIn(media.originalsDir)).toEqual([]);
    expect(filesIn(media.variantsDir)).toEqual([]);
  });

  it('사진 파일을 지우면 원본과 크기별 사진이 모두 사라지고, 다른 사진은 남는다', async () => {
    const data = await makeJpeg(600, 400);
    const first = await media.process({
      name: 'a.jpg',
      type: 'image/jpeg',
      size: data.length,
      data,
    });
    const second = await media.process({
      name: 'b.jpg',
      type: 'image/jpeg',
      size: data.length,
      data,
    });
    await media.deleteFiles([first.id, '../escape']);
    expect(filesIn(media.originalsDir)).toEqual([second.originalFile]);
    expect(filesIn(media.variantsDir).every((name) => name.startsWith(`${second.id}-`))).toBe(true);
    expect(filesIn(media.variantsDir)).toHaveLength(4);
  });

  it('HEIC 사진은 브라우저가 읽는 WebP로 바꿔 저장하고 원본 HEIC도 보관한다', async () => {
    const data = readFileSync(path.resolve(__dirname, '../fixtures/sample.heic'));
    const photo = await media.process({
      name: 'IMG_0001.HEIC',
      type: 'image/heic',
      size: data.length,
      data,
    });
    expect(photo.format).toBe('heic');
    expect(photo.originalFile).toBe('photo1.heic');
    expect(photo.width).toBeGreaterThan(0);
    const meta = await sharp(media.variantFilePath(photo.id, 480)).metadata();
    expect(meta.format).toBe('webp');
  });
});
