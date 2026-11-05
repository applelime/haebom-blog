import { z } from 'zod';
import { blocksSchema, ID_PATTERN } from './blocks';
import { TOPICS, type PostFields } from './types';

const MAX_TITLE_LENGTH = 200;
const MAX_DEK_LENGTH = 300;
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 30;

/** "#리스본", " 트램 " 같은 입력을 "리스본", "트램"으로 정리합니다. 빈 태그와 같은 태그는 뺍니다. */
export function normalizeTags(tags: readonly string[]): string[] {
  const result: string[] = [];
  for (const raw of tags) {
    const tag = raw.normalize('NFC').trim().replace(/^#+/, '').trim();
    if (tag && !result.includes(tag)) result.push(tag);
  }
  return result;
}

/** 태그 입력칸의 글("#리스본 #트램, 도보여행")을 태그 목록으로 바꿉니다. */
export function parseTagInput(input: string): string[] {
  return normalizeTags(input.split(/[\s,]+/));
}

export const postFieldsSchema = z
  .object({
    title: z.string().max(MAX_TITLE_LENGTH),
    topic: z.enum(TOPICS),
    tags: z
      .array(z.string().max(MAX_TAG_LENGTH))
      .max(MAX_TAGS)
      .transform((tags) => normalizeTags(tags)),
    blocks: blocksSchema,
    coverPhotoId: z.string().regex(ID_PATTERN).nullable(),
    dek: z.string().max(MAX_DEK_LENGTH).nullable(),
    visibility: z.enum(['public', 'private']),
  })
  .strict();

export class FieldsValidationError extends Error {
  constructor(public readonly issues: z.ZodIssue[]) {
    super(
      `글 내용 모양이 올바르지 않습니다: ${issues.map((issue) => issue.path.join('.')).join(', ')}`,
    );
    this.name = 'FieldsValidationError';
  }
}

/** 에디터에서 온 내용을 저장 전에 검사합니다(신뢰 경계). */
export function parsePostFields(input: unknown): PostFields {
  const result = postFieldsSchema.safeParse(input);
  if (!result.success) {
    throw new FieldsValidationError(result.error.issues);
  }
  const fields = result.data;
  return {
    ...fields,
    title: fields.title.normalize('NFC'),
    dek: fields.dek === null || fields.dek.trim() === '' ? null : fields.dek.trim(),
  };
}
