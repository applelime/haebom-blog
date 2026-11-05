'use client';

import { useEffect, useRef, useState } from 'react';
import type { PhotoInfo } from '@/lib/media/types';
import { photoSrcSet, photoUrl } from '@/lib/media/rules';

export interface PhotoProps {
  /** 사진 정보. 없으면(지워졌거나 찾지 못함) 불러오기 실패와 같은 모습입니다. */
  photo: PhotoInfo | undefined;
  /** 대체 텍스트. 사진 설명이 비면 글 제목을 넘깁니다(NFR3). */
  alt: string;
  /** 불러오지 못했을 때 회색 자리에 보여줄 설명. 없으면 대체 텍스트를 씁니다(FR1.5). */
  fallbackText?: string;
  /** 비율을 정하는 클래스(r-21x9 등). 없으면 사진 원래 비율로 자리를 잡습니다. */
  frameClassName?: string;
  sizes: string;
  /** 첫 화면 표지, 글의 첫 사진처럼 먼저 보여야 하는 사진(NFR1) */
  priority?: boolean;
  testId?: string;
}

/**
 * 크기별 WebP(srcset)를 쓰는 사진. 비율만큼 자리를 먼저 잡고, 화면 근처에서 불러옵니다.
 * 불러오지 못하면 회색 자리와 사진 설명을 보여주고, 글은 계속 읽을 수 있습니다.
 */
export function Photo({
  photo,
  alt,
  fallbackText,
  frameClassName,
  sizes,
  priority = false,
  testId,
}: PhotoProps) {
  const [failed, setFailed] = useState(photo === undefined);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    // 화면이 준비되기 전에 이미 실패한 사진도 실패로 표시합니다.
    const image = imageRef.current;
    if (image && image.complete && image.naturalWidth === 0 && image.currentSrc) setFailed(true);
  }, []);

  const className = ['photo', frameClassName, failed ? 'is-failed' : ''].filter(Boolean).join(' ');
  const style =
    !frameClassName && photo ? { aspectRatio: `${photo.width} / ${photo.height}` } : undefined;

  if (failed || !photo) {
    return (
      <div
        className={className}
        style={style ?? { aspectRatio: '3 / 2' }}
        role="img"
        aria-label={alt}
        data-testid={testId}
      >
        <span className="photo-fallback">{fallbackText?.trim() || alt}</span>
      </div>
    );
  }

  return (
    <div className={className} style={style} data-testid={testId}>
      <img
        ref={imageRef}
        src={photoUrl(photo.id, 960)}
        srcSet={photoSrcSet(photo.id)}
        sizes={sizes}
        alt={alt}
        width={photo.width}
        height={photo.height}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding="async"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
