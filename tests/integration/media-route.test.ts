// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST } from '@/app/api/media/route';
import { GET } from '@/app/media/[id]/[width]/route';
import { getPhoto } from '@/lib/media/repository';
import { MAX_PHOTO_BYTES } from '@/lib/media/rules';
import { getRuntime, resetRuntime } from '@/lib/runtime';
import { makeTempDir } from '../helpers/temp-dir';

let temp: ReturnType<typeof makeTempDir>;

const AUTHOR_HEADERS = {
  'x-blog-author': '1',
  host: 'localhost:3000',
  'sec-fetch-site': 'same-origin',
};

function uploadRequest(file: File, headers: Record<string, string> = AUTHOR_HEADERS): Request {
  const form = new FormData();
  form.append('file', file);
  return new Request('http://localhost:3000/api/media', { method: 'POST', body: form, headers });
}

async function jpegFile(name = 'lisbon.jpg'): Promise<File> {
  const data = await sharp({
    create: { width: 1200, height: 800, channels: 3, background: { r: 30, g: 110, b: 120 } },
  })
    .jpeg()
    .toBuffer();
  return new File([new Uint8Array(data)], name, { type: 'image/jpeg' });
}

function getVariant(id: string, width: string) {
  return GET(new Request(`http://localhost:3000/media/${id}/${width}`), {
    params: Promise.resolve({ id, width }),
  });
}

beforeEach(async () => {
  temp = makeTempDir('media-route');
  process.env.DATABASE_URL = `file:${path.join(temp.dir, 'blog.db')}`;
  process.env.UPLOAD_DIR = path.join(temp.dir, 'uploads');
  await resetRuntime();
});

afterEach(async () => {
  await resetRuntime();
  delete process.env.DATABASE_URL;
  delete process.env.UPLOAD_DIR;
  temp.remove();
});

describe('사진 올리기와 내보내기 경로', () => {
  it('글쓴이가 아니거나 다른 출처에서 온 올리기 요청은 403으로 거절한다', async () => {
    const reader = await POST(uploadRequest(await jpegFile(), { host: '192.168.0.10:3000' }));
    expect(reader.status).toBe(403);
    const crossSite = await POST(
      uploadRequest(await jpegFile(), { ...AUTHOR_HEADERS, 'sec-fetch-site': 'cross-site' }),
    );
    expect(crossSite.status).toBe(403);
  });

  it('정상 업로드는 201과 사진 id를 돌려주고, 사진 정보를 데이터베이스에 저장한다', async () => {
    const response = await POST(uploadRequest(await jpegFile()));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.photo).toMatchObject({ width: 1200, height: 800 });
    const { database } = await getRuntime();
    expect(await getPhoto(database.db, body.photo.id)).toMatchObject({
      format: 'jpeg',
      width: 1200,
    });
  });

  it('다른 형식은 400과 "파일 이름: 지원하지 않는 형식입니다." 문구를 돌려준다', async () => {
    const movie = new File([new Uint8Array([0, 0, 0, 20, 102, 116, 121, 112])], 'IMG_2041.mov', {
      type: 'video/quicktime',
    });
    const response = await POST(uploadRequest(movie));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatchObject({
      code: 'INVALID_FILE',
      message: 'IMG_2041.mov: 지원하지 않는 형식입니다.',
      fileName: 'IMG_2041.mov',
    });
  });

  it('20MB를 넘는 사진은 400과 "파일 이름: 20MB를 넘습니다." 문구를 돌려준다', async () => {
    // 실제 20MB 파일 대신 크기 값만 크게 보이는 파일로 검사합니다.
    class LargeFile extends File {
      get size() {
        return MAX_PHOTO_BYTES + 1;
      }
    }
    const large = new LargeFile([new Uint8Array([0xff, 0xd8, 0xff])], 'DSC_0102.jpg', {
      type: 'image/jpeg',
    });
    const request = {
      headers: new Headers(AUTHOR_HEADERS),
      formData: async () => ({ get: () => large }),
    } as unknown as Request;
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toBe('DSC_0102.jpg: 20MB를 넘습니다.');
  });

  it('내보내기 경로는 정해진 폭의 WebP만 주고 원본은 주지 않는다', async () => {
    const upload = await POST(uploadRequest(await jpegFile()));
    const { photo } = await upload.json();

    const variant = await getVariant(photo.id, '960');
    expect(variant.status).toBe(200);
    expect(variant.headers.get('content-type')).toBe('image/webp');
    expect(variant.headers.get('cache-control')).toContain('immutable');
    const served = Buffer.from(await variant.arrayBuffer());
    const { media } = await getRuntime();
    const original = readFileSync(path.join(media.originalsDir, `${photo.id}.jpg`));
    expect(served.equals(original)).toBe(false);
    expect((await sharp(served).metadata()).format).toBe('webp');

    for (const width of ['original', '1200', '0960', 'jpg']) {
      expect((await getVariant(photo.id, width)).status).toBe(404);
    }
    expect((await getVariant('..', '960')).status).toBe(404);
    expect((await getVariant('nosuchphoto', '960')).status).toBe(404);
  });
});
