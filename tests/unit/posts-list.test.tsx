import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PostsList, type PostsListItem } from '@/components/posts/PostsList';

function item(id: string, overrides: Partial<PostsListItem>): PostsListItem {
  return {
    id,
    title: `${id} 제목`,
    status: 'published',
    visibility: 'public',
    hasRevision: false,
    updatedAt: new Date(2026, 10, 3).getTime(),
    ...overrides,
  };
}

const SAMPLE: PostsListItem[] = [
  item('kyoto', { title: '교토의 아침 여섯 시', status: 'draft' }),
  item('film', { title: '필름 카메라 입문기', status: 'draft' }),
  item('secret', { title: '혼자 보는 메모', visibility: 'private' }),
  item('lisbon', { title: '리스본, 노란 트램을 따라 걸은 사흘', hasRevision: true }),
  item('bread', { title: '동네 빵집 세 곳의 바게트 비교' }),
];

describe('내 글 목록 (FR6)', () => {
  it('임시 저장, 비공개, 공개 탭 세 개와 탭별 글 수를 보여준다', () => {
    render(<PostsList posts={SAMPLE} onNew={vi.fn()} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['임시 저장 2', '비공개 1', '공개 2']);
    expect(screen.getByRole('tablist', { name: '글 상태' })).toBeInTheDocument();
  });

  it('처음에는 임시 저장 탭이 열리고, 그 탭의 글만 보인다', () => {
    render(<PostsList posts={SAMPLE} onNew={vi.fn()} />);
    expect(screen.getByRole('tab', { name: '임시 저장 2' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const rows = screen.getAllByTestId('posts-row');
    expect(rows.map((row) => within(row).getByText(/./, { selector: '.ttl' }).textContent)).toEqual(
      ['교토의 아침 여섯 시', '필름 카메라 입문기'],
    );
    expect(rows[0]).toHaveAttribute('href', '/write/kyoto');
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: '비공개 1' })).toHaveAttribute('aria-selected', 'true');
  });

  it('탭에 글이 없으면 안내 문구와 새 글 쓰기 버튼을 보여준다 (FR6.3)', () => {
    render(<PostsList posts={[]} onNew={vi.fn()} />);
    expect(screen.getByTestId('posts-empty')).toHaveTextContent('임시 저장한 글이 없습니다.');
    expect(screen.getByTestId('posts-empty-new-button')).toHaveTextContent('새 글 쓰기');
    fireEvent.click(screen.getByRole('tab', { name: '공개 0' }));
    expect(screen.getByTestId('posts-empty')).toHaveTextContent('공개한 글이 없습니다.');
  });

  it('공개 글을 고치는 중이면 원래 탭에 두고 "공개 글, 고치는 중"으로 표시한다 (FR4.5)', () => {
    render(<PostsList posts={SAMPLE} onNew={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: '공개 2' }));
    const editing = screen.getByText('공개 글, 고치는 중');
    expect(editing).toHaveClass('editing');
    expect(editing.closest('a')).toHaveAttribute('href', '/write/lisbon');
    expect(screen.getByText('공개')).not.toHaveClass('editing');
  });

  it('새 글 쓰기 버튼은 새 글을 만든다 (FR6.2)', async () => {
    const onNew = vi.fn(async () => undefined);
    render(<PostsList posts={SAMPLE} onNew={onNew} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('posts-new-button'));
    });
    expect(onNew).toHaveBeenCalledTimes(1);
  });
});
