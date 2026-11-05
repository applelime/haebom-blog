'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PhotoInfo } from '@/lib/media/types';
import { checkPhotoFile } from '@/lib/media/rules';
import {
  addPhotosToBlock,
  BLOCK_LABELS,
  BLOCK_TYPES,
  collectPhotoIds,
  createBlock,
  moveBlock,
  type Block,
  type BlockPhoto,
} from '@/lib/post/blocks';
import { parseTagInput } from '@/lib/post/fields';
import {
  TOPICS,
  TOPIC_LABELS,
  type PostFields,
  type Topic,
  type Visibility,
} from '@/lib/post/types';
import { resolveDek } from '@/lib/post/view';
import { ConfirmDialog } from './ConfirmDialog';
import { EditorBlockItem, type BlockUploadState } from './EditorBlockItem';
import { PreviewDialog } from './PreviewDialog';
import type { EditorActions, UploadPhoto } from './types';
import { uploadPhotoToServer } from './uploadPhoto';

/** 첫 변경 뒤 이 시간 안에 자동 저장합니다(FR4.1: 최대 10초). */
export const AUTOSAVE_DELAY_MS = 5_000;

export const STATUS_TEXT = {
  saving: '저장 중',
  saved: '저장됨',
  failed: '저장하지 못했습니다. 다시 시도해 주세요.',
  editingPublished: '고치는 중 · 독자에게는 이전 내용이 보입니다',
} as const;

const TITLE_REQUIRED = '제목을 입력해 주세요.';

export interface EditorProps {
  initialFields: PostFields;
  isPublished: boolean;
  initialHasPendingEdits: boolean;
  initialPhotos: Record<string, PhotoInfo>;
  firstPublishedAt: number | null;
  actions: EditorActions;
  uploadPhoto?: UploadPhoto;
  navigate?: (url: string) => void;
  autosaveDelayMs?: number;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'failed';
type DialogState = 'none' | 'delete' | 'discard' | 'preview';

function defaultNavigate(url: string) {
  window.location.assign(url);
}

function tagsToInput(tags: string[]): string {
  return tags.map((tag) => `#${tag}`).join(' ');
}

/** 블록 쌓기 에디터(시안: 블록 쌓기 + 전체 화면 미리보기). */
export function Editor(props: EditorProps) {
  const {
    actions,
    isPublished,
    uploadPhoto = uploadPhotoToServer,
    navigate = defaultNavigate,
    autosaveDelayMs = AUTOSAVE_DELAY_MS,
  } = props;
  const [fields, setFields] = useState<PostFields>(props.initialFields);
  const [tagInput, setTagInput] = useState(tagsToInput(props.initialFields.tags));
  const [photos, setPhotos] = useState(props.initialPhotos);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [isDirty, setIsDirty] = useState(false);
  const [hasPendingEdits, setHasPendingEdits] = useState(props.initialHasPendingEdits);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [barMessage, setBarMessage] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [dialog, setDialog] = useState<DialogState>('none');
  const [showCoverPanel, setShowCoverPanel] = useState(false);
  const [uploads, setUploads] = useState<Record<string, BlockUploadState>>({});

  const fieldsRef = useRef(fields);
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const draggedRef = useRef<number | null>(null);
  const pendingFocusRef = useRef<{ id: string; testId: string } | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const saveNow = useCallback(async () => {
    clearTimer();
    if (savingRef.current) return;
    savingRef.current = true;
    const snapshot = fieldsRef.current;
    setSaveState('saving');
    let result;
    try {
      result = await actions.save(snapshot);
    } catch {
      result = { ok: false as const, message: STATUS_TEXT.failed };
    }
    savingRef.current = false;
    if (!result.ok) {
      // 저장에 실패해도 화면의 내용은 그대로 둡니다(FR4.3).
      setSaveState('failed');
      return;
    }
    setSaveState('saved');
    setHasPendingEdits(result.hasPendingEdits);
    if (fieldsRef.current === snapshot) {
      dirtyRef.current = false;
      setIsDirty(false);
    } else {
      timerRef.current = setTimeout(() => void saveNow(), autosaveDelayMs);
    }
  }, [actions, autosaveDelayMs, clearTimer]);

  const update = useCallback(
    (change: (current: PostFields) => PostFields) => {
      const next = change(fieldsRef.current);
      fieldsRef.current = next;
      setFields(next);
      dirtyRef.current = true;
      setIsDirty(true);
      setBarMessage(null);
      if (!timerRef.current) {
        timerRef.current = setTimeout(() => void saveNow(), autosaveDelayMs);
      }
    },
    [autosaveDelayMs, saveNow],
  );

  useEffect(() => clearTimer, [clearTimer]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending) return;
    pendingFocusRef.current = null;
    const target = document.querySelector<HTMLElement>(
      `[data-block-id="${pending.id}"] [data-testid="${pending.testId}"]:not(:disabled)`,
    );
    target?.focus();
  }, [fields.blocks]);

  function setBlocks(change: (blocks: Block[]) => Block[]) {
    update((current) => ({ ...current, blocks: change(current.blocks) }));
  }

  function replaceBlock(blockId: string, next: Block | Block[]) {
    setBlocks((blocks) => {
      const index = blocks.findIndex((block) => block.id === blockId);
      if (index < 0) return blocks;
      const replacement = Array.isArray(next) ? next : [next];
      return [...blocks.slice(0, index), ...replacement, ...blocks.slice(index + 1)];
    });
  }

  function handleMove(index: number, direction: -1 | 1) {
    const block = fieldsRef.current.blocks[index];
    pendingFocusRef.current = {
      id: block.id,
      testId: direction < 0 ? 'block-move-up-button' : 'block-move-down-button',
    };
    setBlocks((blocks) => moveBlock(blocks, index, direction));
  }

  function handleRemove(index: number) {
    const blocks = fieldsRef.current.blocks;
    const neighbour = blocks[index + 1] ?? blocks[index - 1];
    if (neighbour) pendingFocusRef.current = { id: neighbour.id, testId: 'block-remove-button' };
    const removedId = blocks[index].id;
    setUploads((current) => {
      const rest = { ...current };
      delete rest[removedId];
      return rest;
    });
    setBlocks((current) => current.filter((_, position) => position !== index));
  }

  function handleDrop(targetIndex: number) {
    const from = draggedRef.current;
    draggedRef.current = null;
    if (from === null || from === targetIndex) return;
    setBlocks((blocks) => {
      const next = [...blocks];
      const [moved] = next.splice(from, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }

  function setUpload(blockId: string, state: BlockUploadState) {
    setUploads((current) => ({ ...current, [blockId]: state }));
  }

  /** 여러 장을 한 장씩 올리고, 성공한 사진만 블록에 넣습니다. 실패한 사진만 실패로 보여줍니다(FR2.6, FR2.7). */
  async function handleFiles(blockId: string, files: File[]) {
    const invalid: string[] = [];
    const valid: File[] = [];
    for (const file of files) {
      const check = checkPhotoFile({ name: file.name, type: file.type, size: file.size });
      if (check.ok) valid.push(file);
      else invalid.push(check.message);
    }
    const failed: File[] = [];
    const added: BlockPhoto[] = [];
    setUpload(blockId, { uploading: valid.length, invalid, failed });
    for (const [position, file] of valid.entries()) {
      const result = await uploadPhoto(file);
      if (result.ok) {
        added.push({ photoId: result.photo.id, caption: '' });
        setPhotos((current) => ({ ...current, [result.photo.id]: result.photo }));
      } else if (result.kind === 'invalid') {
        invalid.push(result.message);
      } else {
        failed.push(file);
      }
      setUpload(blockId, {
        uploading: valid.length - position - 1,
        invalid: [...invalid],
        failed: [...failed],
      });
    }
    if (added.length > 0) setBlocks((blocks) => addPhotosToBlock(blocks, blockId, added));
  }

  function handleRetry(blockId: string) {
    const failed = uploads[blockId]?.failed ?? [];
    if (failed.length > 0) void handleFiles(blockId, failed);
  }

  async function handlePublish() {
    const current = fieldsRef.current;
    if (!current.title.trim()) {
      setTitleError(TITLE_REQUIRED);
      titleRef.current?.focus();
      return;
    }
    clearTimer();
    setIsPublishing(true);
    setBarMessage(null);
    try {
      const result = await actions.publish(current);
      if (!result.ok) {
        if (result.reason === 'title-required') {
          setTitleError(result.message);
          titleRef.current?.focus();
        } else {
          setBarMessage(result.message);
        }
        return;
      }
      dirtyRef.current = false;
      setIsDirty(false);
      setHasPendingEdits(false);
      if (isPublished) {
        setSaveState('idle');
        setBarMessage('다시 발행했습니다');
      } else {
        navigate(`/posts/${encodeURIComponent(result.slug)}`);
      }
    } catch {
      setBarMessage('발행하지 못했습니다. 다시 시도해 주세요.');
    } finally {
      setIsPublishing(false);
    }
  }

  async function handleDiscard() {
    setDialog('none');
    clearTimer();
    const result = await actions.discard();
    if (!result.ok) {
      setBarMessage(result.message);
      return;
    }
    fieldsRef.current = result.fields;
    setFields(result.fields);
    setTagInput(tagsToInput(result.fields.tags));
    dirtyRef.current = false;
    setIsDirty(false);
    setHasPendingEdits(false);
    setSaveState('idle');
  }

  async function handleDelete() {
    setDialog('none');
    clearTimer();
    dirtyRef.current = false;
    await actions.remove();
  }

  const canRepublish = hasPendingEdits || isDirty;
  const statusText =
    saveState === 'saving'
      ? STATUS_TEXT.saving
      : saveState === 'failed'
        ? STATUS_TEXT.failed
        : isPublished && canRepublish
          ? STATUS_TEXT.editingPublished
          : saveState === 'saved'
            ? STATUS_TEXT.saved
            : '';
  const coverCandidates = collectPhotoIds(fields.blocks);
  const isCustomCover = fields.coverPhotoId !== null || fields.dek !== null;
  const displayTitle = fields.title.trim() || '제목 없는 글';

  return (
    <>
      <div className="ed-bar" data-testid="editor-bar">
        <div className="grp">
          {/* 페이지 전체 이동이어야 저장하지 않은 내용이 있을 때 브라우저가 떠나기 전에 묻습니다(beforeunload). */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/write" data-testid="editor-my-posts-link">
            내 글
          </a>
          <button
            className="plain-btn quiet-link"
            type="button"
            onClick={() => setDialog('delete')}
            data-testid="editor-delete-button"
          >
            지우기
          </button>
        </div>
        <div className="grp">
          <span
            className={`status${saveState === 'failed' ? ' is-failed' : ''}`}
            role="status"
            aria-live="polite"
            data-testid="editor-save-status"
          >
            {statusText}
          </span>
          {barMessage && (
            <span className="notice" role="alert" data-testid="editor-bar-message">
              {barMessage}
            </span>
          )}
          <select
            aria-label="공개 범위"
            value={fields.visibility}
            onChange={(event) =>
              update((current) => ({ ...current, visibility: event.target.value as Visibility }))
            }
            data-testid="editor-visibility-select"
          >
            <option value="public">공개</option>
            <option value="private">비공개</option>
          </select>
          <button
            className="btn quiet"
            type="button"
            onClick={() => void saveNow()}
            data-testid="editor-save-button"
          >
            저장
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => setDialog('preview')}
            data-testid="editor-preview-button"
          >
            미리보기
          </button>
          {isPublished && (
            <button
              className="btn quiet"
              type="button"
              disabled={!canRepublish}
              onClick={() => setDialog('discard')}
              data-testid="editor-discard-button"
            >
              고친 내용 버리기
            </button>
          )}
          <button
            className="btn solid"
            type="button"
            disabled={isPublishing || (isPublished && !canRepublish)}
            onClick={() => void handlePublish()}
            data-testid="editor-publish-button"
          >
            {isPublished ? '다시 발행' : '발행'}
          </button>
        </div>
      </div>

      <div className="ed">
        <label className="sr-only" htmlFor="editor-title">
          글 제목
        </label>
        <input
          id="editor-title"
          ref={titleRef}
          className="ed-title"
          type="text"
          placeholder="제목"
          value={fields.title}
          aria-invalid={titleError ? true : undefined}
          aria-describedby={titleError ? 'editor-title-error' : undefined}
          onChange={(event) => {
            const title = event.target.value;
            if (title.trim()) setTitleError(null);
            update((current) => ({ ...current, title }));
          }}
          data-testid="editor-title-input"
        />
        {titleError && (
          <p
            id="editor-title-error"
            className="field-error"
            role="alert"
            data-testid="editor-title-error"
          >
            {titleError}
          </p>
        )}
        <div className="ed-fields">
          <select
            aria-label="주제"
            value={fields.topic}
            onChange={(event) =>
              update((current) => ({ ...current, topic: event.target.value as Topic }))
            }
            data-testid="editor-topic-select"
          >
            {TOPICS.map((topic) => (
              <option key={topic} value={topic}>
                {TOPIC_LABELS[topic]}
              </option>
            ))}
          </select>
          <input
            type="text"
            aria-label="태그"
            placeholder="#태그 #여러개"
            size={22}
            value={tagInput}
            onChange={(event) => {
              const value = event.target.value;
              setTagInput(value);
              update((current) => ({ ...current, tags: parseTagInput(value) }));
            }}
            data-testid="editor-tags-input"
          />
          <span>
            {isCustomCover
              ? '대표 사진과 소개 문장을 직접 정했습니다. '
              : '대표 사진과 소개 문장은 첫 사진과 첫 문장을 씁니다. '}
            <button
              className="link-btn"
              type="button"
              aria-expanded={showCoverPanel}
              onClick={() => setShowCoverPanel((open) => !open)}
              data-testid="editor-cover-toggle-button"
            >
              바꾸기
            </button>
          </span>
        </div>
        {showCoverPanel && (
          <div className="cover-panel" data-testid="editor-cover-panel">
            <label>
              대표 사진{' '}
              <select
                aria-label="대표 사진"
                value={fields.coverPhotoId ?? ''}
                onChange={(event) =>
                  update((current) => ({ ...current, coverPhotoId: event.target.value || null }))
                }
                data-testid="editor-cover-select"
              >
                <option value="">첫 사진 (자동)</option>
                {coverCandidates.map((photoId, index) => (
                  <option key={photoId} value={photoId}>
                    {index + 1}번째 사진
                  </option>
                ))}
              </select>
            </label>
            <label>
              소개 문장
              <textarea
                aria-label="소개 문장"
                rows={2}
                placeholder={
                  resolveDek({ blocks: fields.blocks, dek: null }) ||
                  '첫 글 블록의 첫 문장을 씁니다'
                }
                value={fields.dek ?? ''}
                onChange={(event) =>
                  update((current) => ({ ...current, dek: event.target.value || null }))
                }
                data-testid="editor-dek-input"
              />
            </label>
            <div>
              <button
                className="btn quiet"
                type="button"
                onClick={() => update((current) => ({ ...current, coverPhotoId: null, dek: null }))}
                data-testid="editor-cover-reset-button"
              >
                자동으로 되돌리기
              </button>
            </div>
          </div>
        )}

        <div data-testid="editor-blocks">
          {fields.blocks.map((block, index) => (
            <EditorBlockItem
              key={block.id}
              block={block}
              index={index}
              count={fields.blocks.length}
              photos={photos}
              upload={uploads[block.id]}
              onChange={(next) => replaceBlock(block.id, next)}
              onMove={(direction) => handleMove(index, direction)}
              onRemove={() => handleRemove(index)}
              onFiles={(files) => void handleFiles(block.id, files)}
              onRetry={() => handleRetry(block.id)}
              onDragStart={() => (draggedRef.current = index)}
              onDropHere={() => handleDrop(index)}
            />
          ))}
        </div>

        <div className="adder" data-testid="editor-block-adder">
          <span className="lbl">블록 추가</span>
          {BLOCK_TYPES.map((type) => (
            <button
              key={type}
              className="btn quiet"
              type="button"
              onClick={() => setBlocks((blocks) => [...blocks, createBlock(type)])}
              data-testid={`editor-add-${type}-button`}
            >
              {BLOCK_LABELS[type]}
            </button>
          ))}
        </div>
      </div>

      {dialog === 'preview' && (
        <PreviewDialog
          fields={fields}
          photos={photos}
          date={props.firstPublishedAt}
          onClose={() => setDialog('none')}
        />
      )}
      {dialog === 'delete' && (
        <ConfirmDialog
          label="글 지우기 확인"
          question={`'${displayTitle}'을 지울까요?`}
          note="지운 글과 사진은 되돌릴 수 없습니다."
          confirmLabel="지우기"
          onConfirm={() => void handleDelete()}
          onCancel={() => setDialog('none')}
          testId="delete-dialog"
        />
      )}
      {dialog === 'discard' && (
        <ConfirmDialog
          label="고친 내용 버리기 확인"
          question="고친 내용을 버리고 발행된 내용으로 되돌릴까요?"
          confirmLabel="버리기"
          onConfirm={() => void handleDiscard()}
          onCancel={() => setDialog('none')}
          testId="discard-dialog"
        />
      )}
    </>
  );
}
