import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BlockList } from '@/components/blocks/BlockList';
import type { PhotoInfo } from '@/lib/media/types';
import type { Block } from '@/lib/post/blocks';
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

const POST_TITLE = '리스본, 노란 트램을 따라 걸은 사흘';

function photosFor(blocks: Block[]): Record<string, PhotoInfo> {
  const map: Record<string, PhotoInfo> = {};
  for (const block of blocks) {
    if ('photos' in block) {
      for (const photo of block.photos)
        map[photo.photoId] = { id: photo.photoId, width: 3000, height: 2000 };
    }
  }
  return map;
}

function renderBlocks(blocks: Block[], photos = photosFor(blocks)) {
  return render(<BlockList blocks={blocks} photos={photos} postTitle={POST_TITLE} />);
}

describe('블록 그리기 (ReaderUI)', () => {
  it('블록 7종을 각각 그린다', () => {
    renderBlocks([
      textBlock('첫날 아침의 기록', '창가의 도시'),
      fullBlock(),
      bodyBlock(),
      rowBlock(),
      sideBlock(photoRef(), '에그타르트 여섯 개', true),
      galleryBlock(6),
      quoteBlock('같은 골목을 이틀 연속 걸으니'),
    ]);
    for (const testId of [
      'block-text',
      'block-photo-full',
      'block-photo-body',
      'block-photo-row',
      'block-photo-side',
      'block-photo-gallery',
      'block-quote',
    ]) {
      expect(screen.getByTestId(testId)).toBeInTheDocument();
    }
    expect(screen.getByRole('heading', { name: '창가의 도시' })).toBeInTheDocument();
    expect(screen.getByTestId('block-photo-side')).toHaveClass('flip');
  });

  it('사진마다 대체 텍스트가 있고, 사진 설명이 비면 글 제목을 쓴다 (NFR3)', () => {
    renderBlocks([
      rowBlock([photoRef('w1', '빨래가 걸린 창문'), photoRef('w2', ''), photoRef('w3', '  ')]),
    ]);
    const images = screen.getAllByRole('img');
    expect(images.map((image) => image.getAttribute('alt'))).toEqual([
      '빨래가 걸린 창문',
      POST_TITLE,
      POST_TITLE,
    ]);
  });

  it('사진은 크기 4종(480, 960, 1600, 2400)의 srcset을 쓰고, 첫 사진만 바로 불러온다 (NFR1)', () => {
    renderBlocks([
      bodyBlock(photoRef('first', '첫 사진')),
      bodyBlock(photoRef('later', '아래 사진')),
    ]);
    const [first, later] = screen.getAllByRole('img') as HTMLImageElement[];
    expect(first.getAttribute('srcset')).toBe(
      '/media/first/480 480w, /media/first/960 960w, /media/first/1600 1600w, /media/first/2400 2400w',
    );
    expect(first).toHaveAttribute('loading', 'eager');
    expect(later).toHaveAttribute('loading', 'lazy');
    expect(first).toHaveAttribute('width', '3000');
    expect(first).toHaveAttribute('height', '2000');
  });

  it('사진을 불러오지 못하면 회색 자리와 사진 설명을 보여주고, 다른 블록은 그대로다 (FR1.5)', () => {
    const blocks = [
      bodyBlock(photoRef('broken', '좁은 골목을 지나는 노란 트램')),
      textBlock('글은 계속 읽힌다'),
      bodyBlock(photoRef('missing', '지워진 사진')),
    ];
    const photos = photosFor(blocks);
    delete photos.missing;
    renderBlocks(blocks, photos);
    fireEvent.error(screen.getByAltText('좁은 골목을 지나는 노란 트램'));
    const failed = screen.getByRole('img', { name: '좁은 골목을 지나는 노란 트램' });
    expect(failed).toHaveClass('is-failed');
    expect(within(failed).getByText('좁은 골목을 지나는 노란 트램')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '지워진 사진' })).toHaveClass('is-failed');
    expect(screen.getByText('글은 계속 읽힌다')).toBeInTheDocument();
  });

  it('인용문 블록은 큰 인용문으로 그린다', () => {
    renderBlocks([quoteBlock('어제와 달라진 창이 눈에 들어왔다.')]);
    const quote = screen.getByText('어제와 달라진 창이 눈에 들어왔다.');
    expect(quote.tagName).toBe('BLOCKQUOTE');
    expect(quote).toHaveClass('pull');
  });

  it('글 속의 HTML 문자는 해석하지 않고 글자 그대로 보여준다', () => {
    const { container } = renderBlocks([textBlock('<b>굵게</b> <script>alert(1)</script>')]);
    expect(screen.getByText('<b>굵게</b> <script>alert(1)</script>')).toBeInTheDocument();
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
  });

  it('[5] 모아 보기는 "1 / 6" 위치와 이전·다음 버튼으로 넘겨 본다', () => {
    renderBlocks([galleryBlock(6, '마지막 날, 공항으로 가기 전까지.')]);
    expect(screen.getByRole('figure', { name: '사진 6장' })).toBeInTheDocument();
    expect(screen.getByTestId('gallery-position')).toHaveTextContent('1 / 6');
    expect(screen.getByRole('button', { name: '이전 사진' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '다음 사진' }));
    expect(screen.getByTestId('gallery-position')).toHaveTextContent('2 / 6');
    fireEvent.keyDown(screen.getByLabelText(/좌우 방향키로 넘겨 보기/), { key: 'ArrowRight' });
    expect(screen.getByTestId('gallery-position')).toHaveTextContent('3 / 6');
    expect(screen.getByText('마지막 날, 공항으로 가기 전까지.')).toBeInTheDocument();
  });
});
