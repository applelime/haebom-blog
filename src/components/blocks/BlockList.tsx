import { Fragment, type ReactNode } from 'react';
import type { PhotoInfo } from '@/lib/media/types';
import { photoShortfall, type Block, type PhotoBlock } from '@/lib/post/blocks';
import { altText } from '@/lib/post/view';
import { Gallery } from './Gallery';
import { Photo } from './Photo';

/**
 * 블록 7종 그리기. 글 본문과 에디터 미리보기가 같은 부품을 씁니다.
 * 블록의 글은 React가 글자로 넣으므로 HTML로 해석되지 않습니다.
 */

export interface BlockListProps {
  blocks: Block[];
  photos: Record<string, PhotoInfo>;
  postTitle: string;
  /** 미리보기에서는 사진이 모자란 블록에 "사진을 더 넣어 주세요"를 보여줍니다. */
  showShortfall?: boolean;
}

const SHORTFALL_MESSAGE = '사진을 더 넣어 주세요';

function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {paragraphs(text).map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </>
  );
}

function figureCaption(block: PhotoBlock): string {
  if (block.caption.trim()) return block.caption;
  return block.photos.length === 1 ? block.photos[0].caption : '';
}

interface RenderContext {
  photos: Record<string, PhotoInfo>;
  postTitle: string;
  showShortfall: boolean;
  isFirstPhoto: (blockId: string) => boolean;
}

function Shortfall({ block, show }: { block: PhotoBlock; show: boolean }) {
  if (!show || photoShortfall(block) === 0) return null;
  return <p className="shortfall">{SHORTFALL_MESSAGE}</p>;
}

function renderPhotoBlock(block: PhotoBlock, context: RenderContext): ReactNode {
  if (block.photos.length === 0 && !context.showShortfall) return null;
  const caption = figureCaption(block);
  const priority = context.isFirstPhoto(block.id);
  const photoProps = (index: number) => {
    const ref = block.photos[index];
    return {
      photo: context.photos[ref.photoId],
      alt: altText(ref.caption, context.postTitle),
      fallbackText: ref.caption || caption,
    };
  };
  switch (block.type) {
    case 'photo-full':
    case 'photo-body': {
      const isFull = block.type === 'photo-full';
      return (
        <figure
          className={`block ${isFull ? 'b-full' : 'b-body'}`}
          data-testid={`block-${block.type}`}
        >
          {block.photos.length > 0 && (
            <Photo
              {...photoProps(0)}
              frameClassName={isFull ? 'r-21x9' : undefined}
              sizes={isFull ? '100vw' : '(max-width: 767px) 92vw, 600px'}
              priority={priority}
            />
          )}
          {caption && <figcaption>{caption}</figcaption>}
          <Shortfall block={block} show={context.showShortfall} />
        </figure>
      );
    }
    case 'photo-row':
      return (
        <figure
          className="block b-row"
          style={{ ['--cols' as string]: Math.max(2, block.photos.length) }}
          data-testid="block-photo-row"
        >
          {block.photos.map((ref, index) => (
            <Photo
              key={ref.photoId}
              {...photoProps(index)}
              frameClassName="r-4x5"
              sizes="(max-width: 767px) 46vw, 360px"
              priority={priority && index === 0}
            />
          ))}
          {caption && <figcaption>{caption}</figcaption>}
          <Shortfall block={block} show={context.showShortfall} />
        </figure>
      );
    case 'photo-side':
      return (
        <div
          className={`block b-side${block.reversed ? ' flip' : ''}`}
          data-testid="block-photo-side"
        >
          <figure className="side-photo">
            {block.photos.length > 0 && (
              <Photo
                {...photoProps(0)}
                frameClassName="r-4x5"
                sizes="(max-width: 767px) 92vw, 540px"
                priority={priority}
              />
            )}
            {caption && <figcaption>{caption}</figcaption>}
            <Shortfall block={block} show={context.showShortfall} />
          </figure>
          <div className="txt">
            {block.heading && <h3>{block.heading}</h3>}
            <Paragraphs text={block.text} />
          </div>
        </div>
      );
    case 'photo-gallery':
      return (
        <div data-testid="block-photo-gallery">
          <Gallery
            caption={block.caption}
            photos={block.photos.map((ref) => ({
              photoId: ref.photoId,
              info: context.photos[ref.photoId],
              alt: altText(ref.caption, context.postTitle),
              caption: ref.caption,
            }))}
          />
          <Shortfall block={block} show={context.showShortfall} />
        </div>
      );
  }
}

function renderBlock(block: Block, context: RenderContext): ReactNode {
  switch (block.type) {
    case 'text':
      if (!block.heading.trim() && !block.text.trim()) return null;
      return (
        <div className="prose" data-testid="block-text">
          {block.heading && <h2>{block.heading}</h2>}
          <Paragraphs text={block.text} />
        </div>
      );
    case 'quote':
      if (!block.text.trim()) return null;
      return (
        <blockquote className="pull" data-testid="block-quote">
          {block.text}
        </blockquote>
      );
    default:
      return renderPhotoBlock(block, context);
  }
}

export function BlockList({ blocks, photos, postTitle, showShortfall = false }: BlockListProps) {
  const firstPhotoBlock = blocks.find(
    (block) => block.type.startsWith('photo-') && (block as PhotoBlock).photos.length > 0,
  );
  const context: RenderContext = {
    photos,
    postTitle,
    showShortfall,
    isFirstPhoto: (blockId) => firstPhotoBlock?.id === blockId,
  };
  return (
    <>
      {blocks.map((block) => (
        <Fragment key={block.id}>{renderBlock(block, context)}</Fragment>
      ))}
    </>
  );
}
