'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { DiscardResult, PublishActionResult, SaveResult } from '@/components/editor/types';
import { assertAuthorWrite } from '@/lib/access/author';
import { ID_PATTERN } from '@/lib/post/blocks';
import { getRuntime } from '@/lib/runtime';

/**
 * 글쓴이 서버 액션: 새 글, 저장, 발행·다시 발행, 버리기, 지우기.
 * 모두 글쓴이 판단(ADR-006)과 같은 사이트 확인을 먼저 거칩니다.
 */

const SAVE_FAILED_MESSAGE = '저장하지 못했습니다. 다시 시도해 주세요.';

async function requireAuthor(postId?: string): Promise<void> {
  assertAuthorWrite(await headers());
  if (postId !== undefined && !ID_PATTERN.test(postId)) {
    throw new Error('알 수 없는 글 id입니다');
  }
}

function logFailure(message: string, postId: string, error: unknown): void {
  console.error(JSON.stringify({ level: 'ERROR', message, postId, error: String(error) }));
}

export async function createPostAction(): Promise<void> {
  await requireAuthor();
  const { posts } = await getRuntime();
  const post = await posts.createDraft();
  redirect(`/write/${post.id}`);
}

export async function saveDraftAction(postId: string, fields: unknown): Promise<SaveResult> {
  await requireAuthor(postId);
  try {
    const { posts } = await getRuntime();
    const result = await posts.saveFields(postId, fields);
    return { ok: true, ...result };
  } catch (error) {
    logFailure('글 저장 실패', postId, error);
    return { ok: false, message: SAVE_FAILED_MESSAGE };
  }
}

export async function publishAction(postId: string, fields: unknown): Promise<PublishActionResult> {
  await requireAuthor(postId);
  try {
    const { posts } = await getRuntime();
    const result = await posts.publish(postId, fields);
    if (!result.ok) return { ok: false, message: result.message, reason: result.reason };
    revalidatePath('/', 'layout');
    return { ok: true, slug: result.post.slug };
  } catch (error) {
    logFailure('글 발행 실패', postId, error);
    return { ok: false, message: '발행하지 못했습니다. 다시 시도해 주세요.', reason: 'failed' };
  }
}

export async function discardAction(postId: string): Promise<DiscardResult> {
  await requireAuthor(postId);
  try {
    const { posts } = await getRuntime();
    return { ok: true, fields: await posts.discardRevision(postId) };
  } catch (error) {
    logFailure('고친 내용 버리기 실패', postId, error);
    return { ok: false, message: '고친 내용을 버리지 못했습니다. 다시 시도해 주세요.' };
  }
}

export async function deleteAction(postId: string): Promise<void> {
  await requireAuthor(postId);
  const { posts } = await getRuntime();
  await posts.deletePost(postId);
  revalidatePath('/', 'layout');
  redirect('/write');
}
