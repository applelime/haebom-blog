'use client';

import { useEffect, useRef } from 'react';

/**
 * 열려 있는 동안 `<dialog>`를 모달로 띄우고, 닫히면 연 버튼으로 초점을 돌려줍니다.
 * Esc(cancel 이벤트)는 onClose로 넘깁니다. showModal이 없는 환경(테스트)에서는 open 속성만 붙입니다.
 */
export function useModalDialog(onClose: () => void) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
    const handleCancel = (event: Event) => {
      event.preventDefault();
      onCloseRef.current();
    };
    dialog.addEventListener('cancel', handleCancel);
    return () => {
      dialog.removeEventListener('cancel', handleCancel);
      if (dialog.open && typeof dialog.close === 'function') dialog.close();
      opener?.focus();
    };
  }, []);

  return dialogRef;
}
