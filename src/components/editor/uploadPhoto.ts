import { REASON_TOO_LARGE, UPLOAD_FAILED_MESSAGE } from '@/lib/media/rules';
import type { UploadResult } from './types';

/** 사진 한 장을 /api/media로 올립니다. 검사 실패와 올리기 실패를 나눠 돌려줍니다(FR2.7, FR3.2). */
export async function uploadPhotoToServer(file: File): Promise<UploadResult> {
  const form = new FormData();
  form.append('file', file);
  try {
    const response = await fetch('/api/media', { method: 'POST', body: form });
    const body = await response.json().catch(() => null);
    if (response.status === 201 && body?.photo) return { ok: true, photo: body.photo };
    if (response.status === 400 && body?.error?.code === 'INVALID_FILE') {
      return { ok: false, kind: 'invalid', message: String(body.error.message) };
    }
    if (response.status === 413) {
      return { ok: false, kind: 'invalid', message: `${file.name}: ${REASON_TOO_LARGE}.` };
    }
    return { ok: false, kind: 'failed', message: UPLOAD_FAILED_MESSAGE };
  } catch {
    return { ok: false, kind: 'failed', message: UPLOAD_FAILED_MESSAGE };
  }
}
