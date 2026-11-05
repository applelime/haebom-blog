import { readFile } from 'node:fs/promises';
import { ID_PATTERN } from '@/lib/post/blocks';
import { isVariantWidth } from '@/lib/media/rules';
import { getRuntime } from '@/lib/runtime';

/**
 * 크기별 WebP 내보내기(GET /media/[id]/[width]). id와 정해진 폭(480, 960, 1600, 2400)만 받습니다.
 * 원본 사진은 이 경로로 내보내지 않습니다.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function notFound(): Response {
  return new Response('Not Found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; width: string }> },
): Promise<Response> {
  const { id, width } = await context.params;
  const widthNumber = Number(width);
  if (!ID_PATTERN.test(id) || String(widthNumber) !== width || !isVariantWidth(widthNumber)) {
    return notFound();
  }
  const { media } = await getRuntime();
  try {
    const data = await readFile(media.variantFilePath(id, widthNumber));
    return new Response(new Uint8Array(data), {
      status: 200,
      headers: {
        'Content-Type': 'image/webp',
        'Content-Length': String(data.length),
        // 사진 id마다 내용이 바뀌지 않으므로 오래 보관해도 됩니다.
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return notFound();
    throw error;
  }
}
