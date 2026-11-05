'use client';

import { useRef, useState, type DragEvent } from 'react';
import type { PhotoInfo } from '@/lib/media/types';
import { PHOTO_ACCEPT, UPLOAD_FAILED_MESSAGE } from '@/lib/media/rules';
import {
  BLOCK_LABELS,
  changeLayout,
  isPhotoBlock,
  PHOTO_LAYOUTS,
  PHOTO_LIMITS,
  photoShortfall,
  type Block,
  type PhotoBlock,
  type PhotoLayout,
} from '@/lib/post/blocks';
import { Photo } from '../blocks/Photo';

export interface BlockUploadState {
  uploading: number;
  invalid: string[];
  failed: File[];
}

export interface EditorBlockItemProps {
  block: Block;
  index: number;
  count: number;
  photos: Record<string, PhotoInfo>;
  upload: BlockUploadState | undefined;
  onChange(next: Block | Block[]): void;
  onMove(direction: -1 | 1): void;
  onRemove(): void;
  onFiles(files: File[]): void;
  onRetry(): void;
  onDragStart(): void;
  onDropHere(): void;
}

function TextFields({
  block,
  onChange,
}: {
  block: Extract<Block, { type: 'text' }>;
  onChange: (b: Block) => void;
}) {
  return (
    <div className="row-fields">
      <input
        type="text"
        aria-label="소제목"
        placeholder="소제목 (넣지 않아도 됩니다)"
        value={block.heading}
        onChange={(event) => onChange({ ...block, heading: event.target.value })}
        data-testid="block-heading-input"
      />
      <textarea
        aria-label="글 내용"
        rows={5}
        value={block.text}
        placeholder="글을 쓰세요. 빈 줄로 문단을 나눕니다."
        onChange={(event) => onChange({ ...block, text: event.target.value })}
        data-testid="block-text-input"
      />
    </div>
  );
}

function PhotoFields(props: EditorBlockItemProps & { block: PhotoBlock }) {
  const { block, photos, upload, onChange, onFiles, onRetry, onRemove } = props;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isOver, setIsOver] = useState(false);
  const { max } = PHOTO_LIMITS[block.type];
  const shortfall = photoShortfall(block);

  function pickFiles() {
    fileInputRef.current?.click();
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsOver(false);
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length > 0) onFiles(files);
  }

  function updatePhotoCaption(photoId: string, caption: string) {
    onChange({
      ...block,
      photos: block.photos.map((photo) =>
        photo.photoId === photoId ? { ...photo, caption } : photo,
      ),
    });
  }

  function removePhoto(photoId: string) {
    onChange({ ...block, photos: block.photos.filter((photo) => photo.photoId !== photoId) });
  }

  return (
    <>
      <div className="eb-type">
        사진 배치
        <select
          aria-label="배치 바꾸기"
          value={block.type}
          onChange={(event) => onChange(changeLayout(block, event.target.value as PhotoLayout))}
          data-testid="block-layout-select"
        >
          {PHOTO_LAYOUTS.map((layout) => (
            <option key={layout} value={layout}>
              {BLOCK_LABELS[layout]}
            </option>
          ))}
        </select>
      </div>
      {block.photos.length > 0 && (
        <div className="mini">
          {block.photos.map((ref) => (
            <div className="mini-item" key={ref.photoId} data-testid="block-photo-item">
              <Photo
                photo={photos[ref.photoId]}
                alt={ref.caption || '올린 사진'}
                frameClassName="r-4x5"
                sizes="240px"
              />
              <input
                className="cap"
                type="text"
                aria-label="사진 설명"
                placeholder="사진 설명"
                value={ref.caption}
                onChange={(event) => updatePhotoCaption(ref.photoId, event.target.value)}
                data-testid="block-photo-caption-input"
              />
              <button
                className="link-btn"
                type="button"
                onClick={() => removePhoto(ref.photoId)}
                data-testid="block-photo-remove-button"
              >
                사진 빼기
              </button>
            </div>
          ))}
        </div>
      )}
      {max > 1 && block.photos.length > 0 && (
        <input
          className="cap"
          type="text"
          aria-label="사진 아래 설명"
          placeholder="사진 아래에 보일 설명"
          value={block.caption}
          onChange={(event) => onChange({ ...block, caption: event.target.value })}
          data-testid="block-caption-input"
        />
      )}
      {block.photos.length > 0 && shortfall > 0 && (
        <p className="shortfall">사진을 더 넣어 주세요</p>
      )}
      {block.type === 'photo-side' && (
        <div className="row-fields">
          <input
            type="text"
            aria-label="소제목"
            placeholder="소제목 (넣지 않아도 됩니다)"
            value={block.heading}
            onChange={(event) => onChange({ ...block, heading: event.target.value })}
            data-testid="block-heading-input"
          />
          <textarea
            aria-label="사진 옆 글"
            rows={4}
            value={block.text}
            onChange={(event) => onChange({ ...block, text: event.target.value })}
            data-testid="block-side-text-input"
          />
          <label>
            <input
              type="checkbox"
              checked={block.reversed}
              onChange={(event) => onChange({ ...block, reversed: event.target.checked })}
              data-testid="block-reverse-checkbox"
            />{' '}
            좌우 바꾸기 (글을 왼쪽에)
          </label>
        </div>
      )}
      {block.photos.length < max && (
        <div
          className={`drop${isOver ? ' is-over' : ''}`}
          onDragOver={(event) => {
            if (event.dataTransfer?.types?.includes('Files')) {
              event.preventDefault();
              setIsOver(true);
            }
          }}
          onDragLeave={() => setIsOver(false)}
          onDrop={handleDrop}
          data-testid="block-drop-zone"
        >
          사진을 여기로 끌어 놓거나
          <br />
          <button
            className="btn"
            type="button"
            onClick={pickFiles}
            data-testid="block-pick-photos-button"
          >
            사진 고르기
          </button>
          <br />
          여러 장을 한 번에 고를 수 있습니다. JPG, PNG, HEIC, WebP 형식, 한 장 20MB까지.
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept={PHOTO_ACCEPT}
        multiple
        hidden
        aria-label="올릴 사진"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          if (files.length > 0) onFiles(files);
        }}
        data-testid="block-photo-file-input"
      />
      {upload && upload.uploading > 0 && (
        <p className="uploading" role="status" data-testid="block-uploading">
          사진 {upload.uploading}장을 올리는 중
        </p>
      )}
      {upload?.invalid.map((message) => (
        <div className="err" role="alert" key={message} data-testid="block-invalid-file-error">
          {message}
          <button
            className="btn quiet"
            type="button"
            onClick={pickFiles}
            data-testid="block-choose-other-button"
          >
            다른 파일 고르기
          </button>
        </div>
      ))}
      {upload && upload.failed.length > 0 && (
        <div className="err" role="alert" data-testid="block-upload-error">
          {UPLOAD_FAILED_MESSAGE}
          <button
            className="btn quiet"
            type="button"
            onClick={onRetry}
            data-testid="block-retry-upload-button"
          >
            다시 올리기
          </button>
          <button
            className="btn quiet"
            type="button"
            onClick={onRemove}
            data-testid="block-remove-after-error-button"
          >
            블록 지우기
          </button>
        </div>
      )}
    </>
  );
}

/** 에디터에서 쌓는 블록 하나. 위로·아래로·지우기 버튼과 손잡이 끌기로 순서를 바꿉니다(FR2.3). */
export function EditorBlockItem(props: EditorBlockItemProps) {
  const { block, index, count, onChange, onMove, onRemove } = props;
  return (
    <div
      className="eb"
      role="group"
      aria-label={`${BLOCK_LABELS[block.type]} 블록`}
      data-block-id={block.id}
      data-block-type={block.type}
      data-testid="editor-block"
      onDragOver={(event) => {
        if (event.dataTransfer?.types?.includes('application/x-block')) event.preventDefault();
      }}
      onDrop={(event) => {
        if (event.dataTransfer?.types?.includes('application/x-block')) {
          event.preventDefault();
          props.onDropHere();
        }
      }}
    >
      <span
        className="grip"
        aria-hidden="true"
        draggable
        onDragStart={(event) => {
          event.dataTransfer?.setData('application/x-block', block.id);
          props.onDragStart();
        }}
      >
        ⋮⋮
      </span>
      <div className="tools">
        <button
          className="ib"
          type="button"
          aria-label="위로"
          disabled={index === 0}
          onClick={() => onMove(-1)}
          data-testid="block-move-up-button"
        >
          ↑
        </button>
        <button
          className="ib"
          type="button"
          aria-label="아래로"
          disabled={index === count - 1}
          onClick={() => onMove(1)}
          data-testid="block-move-down-button"
        >
          ↓
        </button>
        <button
          className="ib"
          type="button"
          aria-label="블록 지우기"
          onClick={onRemove}
          data-testid="block-remove-button"
        >
          ✕
        </button>
      </div>
      {block.type === 'text' && (
        <>
          <div className="eb-type">글</div>
          <TextFields block={block} onChange={onChange} />
        </>
      )}
      {block.type === 'quote' && (
        <>
          <div className="eb-type">인용문</div>
          <textarea
            aria-label="인용문"
            rows={2}
            value={block.text}
            onChange={(event) => onChange({ ...block, text: event.target.value })}
            data-testid="block-quote-input"
          />
        </>
      )}
      {isPhotoBlock(block) && <PhotoFields {...props} block={block} />}
    </div>
  );
}
