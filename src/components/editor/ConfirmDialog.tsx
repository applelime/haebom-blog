'use client';

import { useModalDialog } from '../dialog/useModalDialog';

export interface ConfirmDialogProps {
  label: string;
  question: string;
  note?: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  testId: string;
}

/** 지우기와 버리기 확인 창. 처음 초점은 "취소"에 둡니다(FR4.6). */
export function ConfirmDialog(props: ConfirmDialogProps) {
  const dialogRef = useModalDialog(props.onCancel);
  return (
    <dialog ref={dialogRef} className="confirm" aria-label={props.label} data-testid={props.testId}>
      <p className="question">{props.question}</p>
      {props.note && <p className="note">{props.note}</p>}
      <div className="actions">
        <button
          className="btn quiet"
          type="button"
          autoFocus
          onClick={props.onCancel}
          data-testid={`${props.testId}-cancel-button`}
        >
          취소
        </button>
        <button
          className="btn solid"
          type="button"
          onClick={props.onConfirm}
          data-testid={`${props.testId}-confirm-button`}
        >
          {props.confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
