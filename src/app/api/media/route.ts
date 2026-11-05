import { NextResponse } from 'next/server';
import { assertAuthorWrite, AuthorAccessError } from '@/lib/access/author';
import { MAX_PHOTO_BYTES, UPLOAD_FAILED_MESSAGE } from '@/lib/media/rules';
import { PhotoValidationError } from '@/lib/media/service';
import { storeUploadedPhoto } from '@/lib/media/upload';
import { getRuntime } from '@/lib/runtime';

/**
 * 사진 한 장 올리기(POST multipart, 칸 이름 "file"). 서버 액션의 1MB 제한을 피하려고 경로 처리기로 받습니다.
 * 응답: 201 { photo } / 400 검사 실패 { error: { code, message, fileName, reason } } / 403 / 500 처리 실패
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// multipart 머리말과 칸 이름을 위한 여유
const MAX_REQUEST_BYTES = MAX_PHOTO_BYTES + 1024 * 1024;

function errorResponse(status: number, code: string, message: string, extra: object = {}) {
  return NextResponse.json({ error: { code, message, ...extra } }, { status });
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertAuthorWrite(request.headers);
  } catch (error) {
    if (error instanceof AuthorAccessError) {
      return errorResponse(403, 'FORBIDDEN', '글쓴이 컴퓨터에서만 사진을 올릴 수 있습니다.');
    }
    throw error;
  }

  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (declaredLength > MAX_REQUEST_BYTES) {
    return errorResponse(413, 'TOO_LARGE', '20MB를 넘습니다.', { reason: '20MB를 넘습니다' });
  }

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get('file');
  } catch {
    return errorResponse(400, 'BAD_REQUEST', '사진 파일을 읽지 못했습니다.');
  }
  if (!(file instanceof File)) {
    return errorResponse(400, 'BAD_REQUEST', '사진 파일이 없습니다.');
  }

  try {
    const { database, media } = await getRuntime();
    media.check({ name: file.name, type: file.type, size: file.size });
    const data = Buffer.from(await file.arrayBuffer());
    const photo = await storeUploadedPhoto(
      { db: database.db, media },
      { name: file.name, type: file.type, size: file.size, data },
    );
    return NextResponse.json(
      { photo: { id: photo.id, width: photo.width, height: photo.height } },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof PhotoValidationError) {
      return errorResponse(400, 'INVALID_FILE', error.message, {
        fileName: error.fileName,
        reason: error.reason,
      });
    }
    console.error(
      JSON.stringify({
        level: 'ERROR',
        message: '사진 올리기 실패',
        fileName: file.name,
        error: String(error),
      }),
    );
    return errorResponse(500, 'UPLOAD_FAILED', UPLOAD_FAILED_MESSAGE);
  }
}
