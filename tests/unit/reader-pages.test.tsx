import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostCard } from '@/lib/post/view';
import { postFields } from '../factories';

let currentHeaders = new Headers();
const fakePosts = {
  getHome: vi.fn(),
  getArticle: vi.fn(),
  searchPublic: vi.fn(),
  listPublic: vi.fn(),
  topicCounts: vi.fn(),
};

vi.mock('next/headers', () => ({ headers: async () => currentHeaders }));
vi.mock('@/lib/runtime', () => ({ getRuntime: async () => ({ posts: fakePosts }) }));

const { default: HomePage } = await import('@/app/(reader)/page');
const { default: ReaderLayout } = await import('@/app/(reader)/layout');
const { default: ArticlePage } = await import('@/app/(reader)/posts/[slug]/page');
const { default: SearchPage } = await import('@/app/(reader)/search/page');
const { default: TopicPage } = await import('@/app/(reader)/topics/[topic]/page');
const { NotFoundView } = await import('@/components/reader/NotFoundView');

function card(id: string, title: string, overrides: Partial<PostCard> = {}): PostCard {
  return {
    id,
    slug: id,
    title,
    topic: 'travel',
    dek: `${title}의 소개 문장`,
    date: new Date(2026, 10, 4).getTime(),
    cover: { id: `${id}-photo`, width: 3000, height: 2000, alt: `${title} 사진` },
    ...overrides,
  };
}

const emptyPage = { cards: [], posts: [], total: 0, page: 1, pageCount: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  currentHeaders = new Headers();
  fakePosts.topicCounts.mockResolvedValue({ travel: 4, daily: 4, taste: 2, work: 1 });
});

describe('읽는 화면 (ReaderUI)', () => {
  it('첫 화면은 가장 최근 공개 글을 표지로, 다음 두 편을 최신 글로 보여준다 (FR7.2)', async () => {
    fakePosts.getHome.mockResolvedValue({
      cover: card('lisbon', '리스본, 노란 트램을 따라 걸은 사흘'),
      latest: [
        card('rain', '비 오는 화요일의 창가 자리', { topic: 'daily' }),
        card('bread', '동네 빵집 세 곳의 바게트 비교', { cover: null }),
      ],
    });
    render(await HomePage());
    const cover = screen.getByTestId('home-cover');
    expect(cover).toHaveAttribute('href', '/posts/lisbon');
    expect(cover).toHaveTextContent('리스본, 노란 트램을 따라 걸은 사흘');
    expect(cover).toHaveTextContent('2026년 11월 4일');
    expect(
      screen.getByRole('img', { name: '리스본, 노란 트램을 따라 걸은 사흘 사진' }),
    ).toHaveAttribute('loading', 'eager');
    expect(screen.getAllByTestId('post-card').map((item) => item.getAttribute('href'))).toEqual([
      '/posts/rain',
      '/posts/bread',
    ]);
    expect(screen.getByRole('link', { name: '글 전체 보기' })).toHaveAttribute('href', '/posts');
  });

  it('공개 글이 하나도 없으면 "첫 글을 기다리고 있어요."를 보여준다 (FR7.3)', async () => {
    fakePosts.getHome.mockResolvedValue({ cover: null, latest: [] });
    render(await HomePage());
    expect(screen.getByText('첫 글을 기다리고 있어요.')).toBeInTheDocument();
    expect(screen.queryByTestId('home-cover')).toBeNull();
  });

  it('글쓰기 링크는 글쓴이 컴퓨터(localhost)에서 열었을 때만 보인다 (FR5.4)', async () => {
    const reader = render((await ReaderLayout({ children: <p>본문</p> })) as ReactElement);
    expect(screen.queryByTestId('masthead-write-link')).toBeNull();
    expect(screen.getByRole('button', { name: '목차' })).toBeInTheDocument();
    reader.unmount();

    currentHeaders = new Headers({ 'x-blog-author': '1' });
    render((await ReaderLayout({ children: <p>본문</p> })) as ReactElement);
    expect(screen.getByTestId('masthead-write-link')).toHaveAttribute('href', '/write');
    screen.getByRole('button', { name: '목차' }).click();
    expect(await screen.findByRole('dialog', { name: '목차' })).toHaveTextContent('여행4편');
  });

  it('비공개 글을 독자가 열면 "글을 찾을 수 없습니다."이고, 글쓴이는 "비공개 글" 표시와 함께 본다 (FR5.3)', async () => {
    const post = {
      ...postFields({ visibility: 'private' }),
      id: 'secret',
      slug: 'secret',
      status: 'published',
      firstPublishedAt: 1,
      createdAt: 1,
      updatedAt: 1,
    };
    fakePosts.getArticle.mockImplementation(async (_slug: string, viewer: string) =>
      viewer === 'author' ? { post, photos: {}, coverPhotoId: null, dek: '소개' } : null,
    );
    const params = Promise.resolve({ slug: 'secret' });
    await expect(ArticlePage({ params })).rejects.toMatchObject({
      digest: expect.stringContaining('404'),
    });
    expect(fakePosts.getArticle).toHaveBeenCalledWith('secret', 'reader');
    const notFound = render(<NotFoundView />);
    expect(screen.getByRole('heading', { name: '글을 찾을 수 없습니다.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '첫 화면으로' })).toHaveAttribute('href', '/');
    notFound.unmount();

    currentHeaders = new Headers({ 'x-blog-author': '1' });
    render(await ArticlePage({ params: Promise.resolve({ slug: 'secret' }) }));
    expect(screen.getByTestId('article-flag')).toHaveTextContent('비공개 글');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(post.title);
  });

  it('검색 결과가 없으면 "검색 결과가 없습니다. 다른 단어로 찾아보세요."를 보여준다 (FR10.3)', async () => {
    fakePosts.searchPublic.mockResolvedValue({ ...emptyPage, query: '없는말', ids: [] });
    render(await SearchPage({ searchParams: Promise.resolve({ q: ' 없는말 ' }) }));
    expect(fakePosts.searchPublic).toHaveBeenCalledWith(' 없는말 ', 1);
    expect(screen.getByText('검색 결과가 없습니다. 다른 단어로 찾아보세요.')).toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toHaveValue(' 없는말 ');
  });

  it('주제 모아보기에 글이 없으면 "아직 이 주제의 글이 없습니다."와 첫 화면 링크를 보여준다 (FR9.4)', async () => {
    fakePosts.listPublic.mockResolvedValue(emptyPage);
    render(
      await TopicPage({
        params: Promise.resolve({ topic: 'work' }),
        searchParams: Promise.resolve({ page: '2' }),
      }),
    );
    expect(fakePosts.listPublic).toHaveBeenCalledWith({ topic: 'work', page: 2 });
    expect(screen.getByRole('heading', { name: '일' })).toBeInTheDocument();
    expect(screen.getByText('아직 이 주제의 글이 없습니다.')).toBeInTheDocument();
    expect(screen.getByTestId('empty-state-home-link')).toHaveAttribute('href', '/');
  });
});
