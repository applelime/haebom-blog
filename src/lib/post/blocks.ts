import { nanoid } from 'nanoid';
import { z } from 'zod';

/**
 * 글 본문 블록(ADR-008). 블록 목록은 Post.blocks에 순서대로 JSON으로 저장합니다.
 * 블록의 글은 일반 글자로 저장하고, 화면에서도 HTML로 넣지 않습니다.
 */

export const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_TEXT_LENGTH = 20_000;
const MAX_QUOTE_LENGTH = 1_000;
const MAX_HEADING_LENGTH = 200;
const MAX_CAPTION_LENGTH = 500;

export const PHOTO_LAYOUTS = [
  'photo-full',
  'photo-body',
  'photo-row',
  'photo-side',
  'photo-gallery',
] as const;
export type PhotoLayout = (typeof PHOTO_LAYOUTS)[number];

export const BLOCK_TYPES = ['text', ...PHOTO_LAYOUTS, 'quote'] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

/** 블록별 사진 수: [1] 1장, [2] 1장, [3] 2~3장, [4] 1장, [5] 2장 이상. */
export const PHOTO_LIMITS: Record<PhotoLayout, { min: number; max: number }> = {
  'photo-full': { min: 1, max: 1 },
  'photo-body': { min: 1, max: 1 },
  'photo-row': { min: 2, max: 3 },
  'photo-side': { min: 1, max: 1 },
  'photo-gallery': { min: 2, max: 60 },
};

export const BLOCK_LABELS: Record<BlockType, string> = {
  text: '글',
  'photo-full': '화면 폭 사진',
  'photo-body': '본문 폭 사진',
  'photo-row': '2~3장 나란히',
  'photo-side': '사진과 글 나란히',
  'photo-gallery': '여러 장 모아 보기',
  quote: '인용문',
};

const idSchema = z.string().regex(ID_PATTERN, '알 수 없는 id 모양입니다');

export const blockPhotoSchema = z
  .object({
    photoId: idSchema,
    /** 사진 설명. 대체 텍스트로도 씁니다(FR2.5). 비면 글 제목으로 대신합니다(NFR3). */
    caption: z.string().max(MAX_CAPTION_LENGTH).default(''),
  })
  .strict();
export type BlockPhoto = z.infer<typeof blockPhotoSchema>;

const textBlockSchema = z
  .object({
    id: idSchema,
    type: z.literal('text'),
    heading: z.string().max(MAX_HEADING_LENGTH).default(''),
    text: z.string().max(MAX_TEXT_LENGTH),
  })
  .strict();

const quoteBlockSchema = z
  .object({
    id: idSchema,
    type: z.literal('quote'),
    text: z.string().max(MAX_QUOTE_LENGTH),
  })
  .strict();

function simplePhotoBlockSchema<T extends Exclude<PhotoLayout, 'photo-side'>>(type: T) {
  return z
    .object({
      id: idSchema,
      type: z.literal(type),
      photos: z.array(blockPhotoSchema).max(PHOTO_LIMITS[type].max),
      /** 사진 아래 설명. 사진이 여러 장인 블록에서 묶음 설명으로 씁니다. */
      caption: z.string().max(MAX_CAPTION_LENGTH).default(''),
    })
    .strict();
}

const sideBlockSchema = z
  .object({
    id: idSchema,
    type: z.literal('photo-side'),
    photos: z.array(blockPhotoSchema).max(PHOTO_LIMITS['photo-side'].max),
    caption: z.string().max(MAX_CAPTION_LENGTH).default(''),
    heading: z.string().max(MAX_HEADING_LENGTH).default(''),
    text: z.string().max(MAX_TEXT_LENGTH).default(''),
    /** true면 글이 왼쪽, 사진이 오른쪽입니다(좌우 바꾸기). */
    reversed: z.boolean().default(false),
  })
  .strict();

export const blockSchema = z.discriminatedUnion('type', [
  textBlockSchema,
  simplePhotoBlockSchema('photo-full'),
  simplePhotoBlockSchema('photo-body'),
  simplePhotoBlockSchema('photo-row'),
  sideBlockSchema,
  simplePhotoBlockSchema('photo-gallery'),
  quoteBlockSchema,
]);

export const blocksSchema = z.array(blockSchema).max(200);

export type Block = z.infer<typeof blockSchema>;
export type BlockInput = z.input<typeof blockSchema>;
export type TextBlock = Extract<Block, { type: 'text' }>;
export type QuoteBlock = Extract<Block, { type: 'quote' }>;
export type SideBlock = Extract<Block, { type: 'photo-side' }>;
export type PhotoBlock = Extract<Block, { type: PhotoLayout }>;

export class BlockValidationError extends Error {
  constructor(public readonly issues: z.ZodIssue[]) {
    super(
      `블록 모양이 올바르지 않습니다: ${issues.map((issue) => issue.path.join('.')).join(', ')}`,
    );
    this.name = 'BlockValidationError';
  }
}

/** 저장 전에 블록 목록의 모양을 검사합니다. 잘못된 블록이 있으면 BlockValidationError를 던집니다. */
export function parseBlocks(input: unknown): Block[] {
  const result = blocksSchema.safeParse(input);
  if (!result.success) {
    throw new BlockValidationError(result.error.issues);
  }
  return result.data;
}

export function isPhotoLayout(type: string): type is PhotoLayout {
  return (PHOTO_LAYOUTS as readonly string[]).includes(type);
}

export function isPhotoBlock(block: Block): block is PhotoBlock {
  return isPhotoLayout(block.type);
}

export function newBlockId(): string {
  return nanoid(10);
}

export function createBlock(type: BlockType): Block {
  const id = newBlockId();
  switch (type) {
    case 'text':
      return { id, type, heading: '', text: '' };
    case 'quote':
      return { id, type, text: '' };
    case 'photo-side':
      return { id, type, photos: [], caption: '', heading: '', text: '', reversed: false };
    default:
      return { id, type, photos: [], caption: '' };
  }
}

/** 사진이 블록 최소 수보다 몇 장 모자라는지. 0이면 충분합니다. */
export function photoShortfall(block: PhotoBlock): number {
  return Math.max(0, PHOTO_LIMITS[block.type].min - block.photos.length);
}

function splitIntoGalleries(photos: BlockPhoto[]): Block[] {
  const { max } = PHOTO_LIMITS['photo-gallery'];
  const galleries: Block[] = [];
  for (let start = 0; start < photos.length; start += max) {
    galleries.push({
      id: newBlockId(),
      type: 'photo-gallery',
      photos: photos.slice(start, start + max),
      caption: '',
    });
  }
  return galleries;
}

function buildPhotoBlock(
  layout: PhotoLayout,
  base: { id: string; photos: BlockPhoto[]; caption: string },
  from: PhotoBlock,
): PhotoBlock {
  if (layout === 'photo-side') {
    const side = from.type === 'photo-side' ? from : null;
    return {
      ...base,
      type: layout,
      heading: side?.heading ?? '',
      text: side?.text ?? '',
      reversed: side?.reversed ?? false,
    };
  }
  return { ...base, type: layout };
}

/**
 * 사진 블록의 배치를 바꿉니다(FR2.4). 사진 id와 설명은 그대로 둡니다.
 * 새 배치에 넘치는 사진은 바로 뒤의 새 [5] 모아 보기 블록으로 옮기고,
 * [4]에서 다른 배치로 바꿀 때 쓰던 글은 새 글 블록으로 남깁니다.
 */
export function changeLayout(block: PhotoBlock, layout: PhotoLayout): Block[] {
  const { max } = PHOTO_LIMITS[layout];
  const kept = block.photos.slice(0, max);
  const overflow = block.photos.slice(max);
  const result: Block[] = [
    buildPhotoBlock(layout, { id: block.id, photos: kept, caption: block.caption }, block),
  ];
  if (block.type === 'photo-side' && layout !== 'photo-side') {
    if (block.heading.trim() || block.text.trim()) {
      result.push({ id: newBlockId(), type: 'text', heading: block.heading, text: block.text });
    }
  }
  if (overflow.length > 0) {
    result.push(...splitIntoGalleries(overflow));
  }
  return result;
}

/**
 * 블록 하나에 사진을 더합니다(FR2.6). 배치의 최대 수를 넘는 사진은 바로 뒤의 새 [5] 블록으로 옮깁니다.
 */
export function addPhotosToBlock(blocks: Block[], blockId: string, photos: BlockPhoto[]): Block[] {
  const index = blocks.findIndex((block) => block.id === blockId);
  if (index < 0) return blocks;
  const target = blocks[index];
  if (!isPhotoBlock(target)) return blocks;
  const merged = { ...target, photos: [...target.photos, ...photos] } as PhotoBlock;
  const replaced = changeLayout(merged, target.type);
  return [...blocks.slice(0, index), ...replaced, ...blocks.slice(index + 1)];
}

export function moveBlock(blocks: Block[], index: number, direction: -1 | 1): Block[] {
  const target = index + direction;
  if (index < 0 || index >= blocks.length || target < 0 || target >= blocks.length) {
    return blocks;
  }
  const next = [...blocks];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function collectPhotoIds(blocks: Block[]): string[] {
  const ids: string[] = [];
  for (const block of blocks) {
    if (!isPhotoBlock(block)) continue;
    for (const photo of block.photos) {
      if (!ids.includes(photo.photoId)) ids.push(photo.photoId);
    }
  }
  return ids;
}
