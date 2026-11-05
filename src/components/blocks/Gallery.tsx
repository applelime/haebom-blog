'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import type { PhotoInfo } from '@/lib/media/types';
import { Photo } from './Photo';

export interface GalleryPhoto {
  photoId: string;
  info: PhotoInfo | undefined;
  alt: string;
  caption: string;
}

/** [5] 여러 장 모아 보기: 옆으로 넘겨 보기, "1 / 6" 위치, 이전·다음 버튼(FR1.2, FR1.3). */
export function Gallery({ photos, caption }: { photos: GalleryPhoto[]; caption: string }) {
  const [index, setIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const total = photos.length;

  function goTo(next: number) {
    const clamped = Math.min(Math.max(next, 0), total - 1);
    setIndex(clamped);
    const track = trackRef.current;
    const item = track?.children[clamped] as HTMLElement | undefined;
    if (track && item && typeof track.scrollTo === 'function') {
      track.scrollTo({ left: item.offsetLeft - track.offsetLeft, behavior: 'smooth' });
    }
  }

  function handleScroll() {
    const track = trackRef.current;
    const first = track?.children[0] as HTMLElement | undefined;
    if (!track || !first || first.offsetWidth === 0) return;
    const step = first.offsetWidth + 12;
    setIndex(Math.min(total - 1, Math.max(0, Math.round(track.scrollLeft / step))));
  }

  function handleKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      goTo(index + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goTo(index - 1);
    }
  }

  return (
    <figure className="block b-gallery" aria-label={`사진 ${total}장`} data-testid="block-gallery">
      <div
        className="track"
        ref={trackRef}
        tabIndex={0}
        aria-label={`사진 ${total}장, 좌우 방향키로 넘겨 보기`}
        onScroll={handleScroll}
        onKeyDown={handleKey}
      >
        {photos.map((photo) => (
          <Photo
            key={photo.photoId}
            photo={photo.info}
            alt={photo.alt}
            fallbackText={photo.caption}
            frameClassName="r-3x2"
            sizes="(max-width: 767px) 84vw, 500px"
          />
        ))}
      </div>
      <div className="gallery-foot">
        <figcaption>{caption}</figcaption>
        <div className="ctl">
          <span aria-live="polite" data-testid="gallery-position">
            {index + 1} / {total}
          </span>
          <button
            type="button"
            aria-label="이전 사진"
            onClick={() => goTo(index - 1)}
            disabled={index === 0}
            data-testid="gallery-prev-button"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="다음 사진"
            onClick={() => goTo(index + 1)}
            disabled={index >= total - 1}
            data-testid="gallery-next-button"
          >
            ›
          </button>
        </div>
      </div>
    </figure>
  );
}
