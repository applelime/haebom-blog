// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  addPhotosToBlock,
  BlockValidationError,
  changeLayout,
  parseBlocks,
  photoShortfall,
  type PhotoBlock,
} from '@/lib/post/blocks';
import {
  bodyBlock,
  fullBlock,
  galleryBlock,
  photoRef,
  quoteBlock,
  rowBlock,
  sideBlock,
  textBlock,
} from '../factories';

describe('블록 모양 (ADR-008)', () => {
  it('블록 7종(text, photo-full, photo-body, photo-row, photo-side, photo-gallery, quote)을 모두 받는다', () => {
    const blocks = [
      textBlock('본문'),
      fullBlock(),
      bodyBlock(),
      rowBlock(),
      sideBlock(),
      galleryBlock(),
      quoteBlock('강조할 문장'),
    ];
    const parsed = parseBlocks(blocks);
    expect(parsed.map((block) => block.type)).toEqual([
      'text',
      'photo-full',
      'photo-body',
      'photo-row',
      'photo-side',
      'photo-gallery',
      'quote',
    ]);
  });

  it('블록별 사진 수 범위를 지킨다: 최대를 넘으면 거절하고, 모자라면 모자란 수를 알려준다', () => {
    const tooManyInRow = rowBlock([photoRef(), photoRef(), photoRef(), photoRef()]);
    const twoInFull = { ...fullBlock(), photos: [photoRef(), photoRef()] };
    expect(() => parseBlocks([tooManyInRow])).toThrow(BlockValidationError);
    expect(() => parseBlocks([twoInFull])).toThrow(BlockValidationError);

    const oneInRow = rowBlock([photoRef()]) as PhotoBlock;
    const emptyBody = { ...bodyBlock(), photos: [] } as PhotoBlock;
    const oneInGallery = galleryBlock(1) as PhotoBlock;
    expect(photoShortfall(oneInRow)).toBe(1);
    expect(photoShortfall(emptyBody)).toBe(1);
    expect(photoShortfall(oneInGallery)).toBe(1);
    expect(photoShortfall(galleryBlock(6) as PhotoBlock)).toBe(0);
  });

  it('배치를 바꿔도 같은 사진과 사진 설명을 유지한다 ([2] → [1])', () => {
    const photo = photoRef('lisbonTram', '좁은 골목을 지나는 노란 트램');
    const block = bodyBlock(photo) as PhotoBlock;
    const [changed, ...rest] = changeLayout(block, 'photo-full');
    expect(rest).toHaveLength(0);
    expect(changed.type).toBe('photo-full');
    expect(changed.id).toBe(block.id);
    expect((changed as PhotoBlock).photos).toEqual([photo]);
  });

  it('새 배치에 넘치는 사진은 바로 뒤 새 [5] 모아 보기 블록으로 옮긴다', () => {
    const gallery = galleryBlock(6) as PhotoBlock;
    const result = changeLayout(gallery, 'photo-row');
    expect(result).toHaveLength(2);
    const [row, overflow] = result as PhotoBlock[];
    expect(row.type).toBe('photo-row');
    expect(row.photos.map((p) => p.photoId)).toEqual(
      gallery.photos.slice(0, 3).map((p) => p.photoId),
    );
    expect(overflow.type).toBe('photo-gallery');
    expect(overflow.photos.map((p) => p.photoId)).toEqual(
      gallery.photos.slice(3).map((p) => p.photoId),
    );
    // [4]에서 다른 배치로 바꾸면 쓰던 글은 새 글 블록으로 남는다
    const side = sideBlock(photoRef(), '에그타르트 이야기') as PhotoBlock;
    const fromSide = changeLayout(side, 'photo-body');
    expect(fromSide.map((block) => block.type)).toEqual(['photo-body', 'text']);
  });

  it('여러 장을 한 번에 넣으면 [5] 블록 하나에 6장이 모두 들어간다 (FR2.6)', () => {
    const empty = { ...galleryBlock(0) };
    const sixPhotos = Array.from({ length: 6 }, () => photoRef());
    const result = addPhotosToBlock([textBlock('앞 글'), empty], empty.id, sixPhotos);
    expect(result).toHaveLength(2);
    expect((result[1] as PhotoBlock).photos).toHaveLength(6);
  });

  it('잘못된 블록은 거절한다: 모르는 종류, 이상한 id, 빠진 글, 모르는 칸', () => {
    expect(() => parseBlocks([{ id: 'b1', type: 'video', url: 'x' }])).toThrow(
      BlockValidationError,
    );
    expect(() => parseBlocks([{ id: '../etc', type: 'text', text: '글' }])).toThrow(
      BlockValidationError,
    );
    expect(() => parseBlocks([{ id: 'b1', type: 'text' }])).toThrow(BlockValidationError);
    expect(() =>
      parseBlocks([{ id: 'b1', type: 'quote', text: '인용', html: '<b>x</b>' }]),
    ).toThrow(BlockValidationError);
    expect(() => parseBlocks('not-a-list')).toThrow(BlockValidationError);
  });

  it('글 블록의 HTML 문자는 바꾸거나 지우지 않고 일반 글자로 그대로 남긴다', () => {
    const raw = '<script>alert("x")</script> & <b>굵게</b>';
    const [block] = parseBlocks([textBlock(raw)]);
    expect(block.type).toBe('text');
    expect(block.type === 'text' && block.text).toBe(raw);
  });
});
