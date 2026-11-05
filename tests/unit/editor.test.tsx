import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor, STATUS_TEXT, type EditorProps } from '@/components/editor/Editor';
import type { EditorActions, UploadPhoto } from '@/components/editor/types';
import type { PostFields } from '@/lib/post/types';
import { bodyBlock, galleryBlock, photoRef, postFields } from '../factories';

function makeActions(overrides: Partial<EditorActions> = {}) {
  return {
    save: vi.fn(async () => ({ ok: true as const, savedAt: 1, hasPendingEdits: false })),
    publish: vi.fn(async () => ({ ok: true as const, slug: 'lisbon' })),
    discard: vi.fn(async () => ({
      ok: true as const,
      fields: postFields({ title: '발행본 제목' }),
    })),
    remove: vi.fn(async () => undefined),
    ...overrides,
  };
}

function renderEditor(props: Partial<EditorProps> & { fields?: PostFields } = {}) {
  const actions = props.actions ?? makeActions();
  const navigate = vi.fn();
  const view = render(
    <Editor
      initialFields={props.fields ?? postFields({ title: '', blocks: [] })}
      isPublished={props.isPublished ?? false}
      initialHasPendingEdits={props.initialHasPendingEdits ?? false}
      initialPhotos={props.initialPhotos ?? {}}
      firstPublishedAt={null}
      actions={actions}
      uploadPhoto={props.uploadPhoto}
      navigate={navigate}
    />,
  );
  return { ...view, actions, navigate };
}

function blocks() {
  return screen.queryAllByTestId('editor-block');
}

function typeTitle(value: string) {
  fireEvent.change(screen.getByTestId('editor-title-input'), { target: { value } });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('에디터 (EditorUI)', () => {
  it('블록을 추가하고 위로·아래로 버튼으로 순서를 바꾼다 (FR2.2, FR2.3)', () => {
    renderEditor();
    fireEvent.click(screen.getByTestId('editor-add-text-button'));
    fireEvent.click(screen.getByTestId('editor-add-photo-row-button'));
    fireEvent.click(screen.getByTestId('editor-add-quote-button'));
    expect(blocks().map((block) => block.dataset.blockType)).toEqual([
      'text',
      'photo-row',
      'quote',
    ]);

    fireEvent.click(within(blocks()[2]).getByRole('button', { name: '위로' }));
    expect(blocks().map((block) => block.dataset.blockType)).toEqual([
      'text',
      'quote',
      'photo-row',
    ]);
    fireEvent.click(within(blocks()[0]).getByRole('button', { name: '아래로' }));
    expect(blocks().map((block) => block.dataset.blockType)).toEqual([
      'quote',
      'text',
      'photo-row',
    ]);
    expect(within(blocks()[0]).getByRole('button', { name: '위로' })).toBeDisabled();

    fireEvent.click(within(blocks()[1]).getByRole('button', { name: '블록 지우기' }));
    expect(blocks().map((block) => block.dataset.blockType)).toEqual(['quote', 'photo-row']);
  });

  it('사진 블록의 배치를 바꿔도 사진과 사진 설명은 그대로 남는다 (FR2.4)', async () => {
    const fields = postFields({ blocks: [bodyBlock(photoRef('tram', '골목을 지나는 트램'))] });
    const { actions } = renderEditor({
      fields,
      initialPhotos: { tram: { id: 'tram', width: 300, height: 200 } },
    });
    fireEvent.change(screen.getByRole('combobox', { name: '배치 바꾸기' }), {
      target: { value: 'photo-full' },
    });
    expect(blocks()[0].dataset.blockType).toBe('photo-full');
    expect(screen.getByRole('textbox', { name: '사진 설명' })).toHaveValue('골목을 지나는 트램');

    await act(async () => {
      fireEvent.click(screen.getByTestId('editor-save-button'));
    });
    const saved = vi.mocked(actions.save).mock.calls[0][0];
    expect(saved.blocks[0]).toMatchObject({
      type: 'photo-full',
      photos: [{ photoId: 'tram', caption: '골목을 지나는 트램' }],
    });
  });

  it('쓰는 동안 10초 안에 자동 저장하고 "저장됨"을 보여준다 (FR4.1)', async () => {
    vi.useFakeTimers();
    const { actions } = renderEditor();
    typeTitle('비 오는 화요일');
    expect(actions.save).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(actions.save).toHaveBeenCalledTimes(1);
    expect(vi.mocked(actions.save).mock.calls[0][0].title).toBe('비 오는 화요일');
    expect(screen.getByRole('status')).toHaveTextContent(STATUS_TEXT.saved);
  });

  it('저장에 실패해도 쓰던 내용은 남고 "저장하지 못했습니다. 다시 시도해 주세요."를 보여준다 (FR4.3)', async () => {
    vi.useFakeTimers();
    const actions = makeActions({
      save: vi.fn(async () => ({ ok: false as const, message: STATUS_TEXT.failed })),
    });
    renderEditor({ actions });
    typeTitle('지워지면 안 되는 제목');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(screen.getByTestId('editor-save-status')).toHaveTextContent(
      '저장하지 못했습니다. 다시 시도해 주세요.',
    );
    expect(screen.getByTestId('editor-title-input')).toHaveValue('지워지면 안 되는 제목');
  });

  it('제목 없이 발행을 누르면 발행하지 않고 제목 칸에 "제목을 입력해 주세요."를 보여준다 (FR4.4)', async () => {
    const { actions, navigate } = renderEditor({ fields: postFields({ title: '' }) });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '발행' }));
    });
    expect(actions.publish).not.toHaveBeenCalled();
    expect(screen.getByTestId('editor-title-error')).toHaveTextContent('제목을 입력해 주세요.');
    expect(screen.getByTestId('editor-title-input')).toHaveFocus();

    typeTitle('리스본');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '발행' }));
    });
    expect(actions.publish).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/posts/lisbon');
  });

  it('발행한 글에서는 "다시 발행"과 "고친 내용 버리기"를 보여주고, 고친 것이 없으면 흐리게 둔다 (FR4.5)', async () => {
    const { actions } = renderEditor({
      fields: postFields({ title: '발행본 제목' }),
      isPublished: true,
    });
    const republish = screen.getByRole('button', { name: '다시 발행' });
    const discard = screen.getByRole('button', { name: '고친 내용 버리기' });
    expect(screen.queryByRole('button', { name: '발행' })).toBeNull();
    expect(republish).toBeDisabled();
    expect(discard).toBeDisabled();

    typeTitle('고친 제목');
    expect(republish).toBeEnabled();
    expect(screen.getByTestId('editor-save-status')).toHaveTextContent(
      STATUS_TEXT.editingPublished,
    );
    fireEvent.click(discard);
    expect(screen.getByRole('dialog', { name: '고친 내용 버리기 확인' })).toHaveTextContent(
      '고친 내용을 버리고 발행된 내용으로 되돌릴까요?',
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '버리기' }));
    });
    expect(actions.discard).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('editor-title-input')).toHaveValue('발행본 제목');
    expect(republish).toBeDisabled();
  });

  it('지우기 확인 창에서 취소하면 글이 그대로 남고, 확인하면 지운다 (FR4.6)', async () => {
    const { actions } = renderEditor({
      fields: postFields({ title: '리스본, 노란 트램을 따라 걸은 사흘' }),
    });
    fireEvent.click(screen.getByTestId('editor-delete-button'));
    const dialog = screen.getByRole('dialog', { name: '글 지우기 확인' });
    expect(dialog).toHaveTextContent("'리스본, 노란 트램을 따라 걸은 사흘'을 지울까요?");
    expect(dialog).toHaveTextContent('지운 글과 사진은 되돌릴 수 없습니다.');
    expect(within(dialog).getByRole('button', { name: '취소' })).toHaveFocus();
    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(actions.remove).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('editor-delete-button'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('delete-dialog-confirm-button'));
    });
    expect(actions.remove).toHaveBeenCalledTimes(1);
  });

  it('사진 오류는 파일 검사 실패와 올리기 실패로 나눠 보여주고, 성공한 사진은 들어간다 (FR2.6, FR2.7, FR3.2)', async () => {
    const uploadPhoto: UploadPhoto = vi.fn(async (file: File) =>
      file.name === 'ok.jpg'
        ? { ok: true as const, photo: { id: 'uploaded1', width: 300, height: 200 } }
        : { ok: false as const, kind: 'failed' as const, message: '사진을 올리지 못했습니다.' },
    );
    renderEditor({ fields: postFields({ blocks: [galleryBlock(0)] }), uploadPhoto });
    const files = [
      new File(['x'], 'IMG_2041.mov', { type: 'video/quicktime' }),
      new File(['x'], 'ok.jpg', { type: 'image/jpeg' }),
      new File(['x'], 'network.jpg', { type: 'image/jpeg' }),
    ];
    await act(async () => {
      fireEvent.change(screen.getByTestId('block-photo-file-input'), { target: { files } });
    });
    expect(screen.getByTestId('block-invalid-file-error')).toHaveTextContent(
      'IMG_2041.mov: 지원하지 않는 형식입니다.',
    );
    expect(screen.getByRole('button', { name: '다른 파일 고르기' })).toBeInTheDocument();
    expect(screen.getByTestId('block-upload-error')).toHaveTextContent('사진을 올리지 못했습니다.');
    expect(screen.getByRole('button', { name: '다시 올리기' })).toBeInTheDocument();
    expect(screen.getByTestId('block-remove-after-error-button')).toHaveTextContent('블록 지우기');
    expect(uploadPhoto).toHaveBeenCalledTimes(2);
    expect(screen.getAllByTestId('block-photo-item')).toHaveLength(1);
    expect(screen.getByText('사진을 더 넣어 주세요')).toBeInTheDocument();
  });
});
