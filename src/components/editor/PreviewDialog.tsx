'use client';

import type { PhotoInfo } from '@/lib/media/types';
import type { PostFields } from '@/lib/post/types';
import { resolveDek } from '@/lib/post/view';
import { ArticleView } from '../reader/ArticleView';
import { useModalDialog } from '../dialog/useModalDialog';

/** 미리보기: 저장 전 내용까지 공개 화면과 같은 블록 그리기로 전체 화면에 보여줍니다. */
export function PreviewDialog({
  fields,
  photos,
  date,
  onClose,
}: {
  fields: PostFields;
  photos: Record<string, PhotoInfo>;
  date: number | null;
  onClose: () => void;
}) {
  const dialogRef = useModalDialog(onClose);
  return (
    <dialog ref={dialogRef} className="full" aria-label="미리보기" data-testid="preview-dialog">
      <div className="preview-bar">
        <span>미리보기: 발행하면 이렇게 보입니다</span>
        <button type="button" autoFocus onClick={onClose} data-testid="preview-dialog-close-button">
          편집으로 돌아가기
        </button>
      </div>
      <ArticleView
        title={fields.title}
        topic={fields.topic}
        dek={resolveDek(fields)}
        date={date}
        tags={fields.tags}
        blocks={fields.blocks}
        photos={photos}
        status="published"
        visibility="public"
        isAuthor={false}
        showShortfall
      />
    </dialog>
  );
}
