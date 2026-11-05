import { nanoid } from 'nanoid';
import type { Db } from '../db/client';
import { getPhotosByIds, deletePhotos } from '../media/repository';
import { toPhotoInfo, type PhotoInfo } from '../media/types';
import type { SearchService } from '../search/service';
import { collectPhotoIds } from './blocks';
import { parsePostFields } from './fields';
import * as repo from './repository';
import {
  DEFAULT_TOPIC,
  isPubliclyVisible,
  type Post,
  type PostFields,
  type Topic,
  type Viewer,
  type Visibility,
} from './types';
import { resolveCoverPhotoId, resolveDek, toPostCard, type PostCard } from './view';

/**
 * PostContent 업무 규칙: 저장, 발행, 다시 발행, 사본 버리기, 공개 범위, 지우기, 보는 사람별 노출(ADR-005).
 * 모든 쓰기는 트랜잭션 하나이고, 검색 내용도 같은 트랜잭션에서 고칩니다.
 */

export const TITLE_REQUIRED_MESSAGE = '제목을 입력해 주세요.';
export const BLOCKS_REQUIRED_MESSAGE = '블록을 하나 이상 넣어 주세요.';

export class PostNotFoundError extends Error {
  constructor(public readonly postId: string) {
    super(`글을 찾을 수 없습니다: ${postId}`);
    this.name = 'PostNotFoundError';
  }
}

export type PublishResult =
  | { ok: true; post: Post }
  | { ok: false; reason: 'title-required' | 'blocks-required'; message: string };

export interface PostServiceDeps {
  db: Db;
  search: Pick<SearchService, 'syncPost' | 'removePost' | 'search'>;
  media: { deleteFiles(photoIds: string[]): Promise<void> };
  now?: () => number;
  createId?: () => string;
}

export interface EditorPost {
  post: Post;
  /** 에디터에 보여줄 내용: 작업 사본이 있으면 사본, 없으면 글 자체 */
  fields: PostFields;
  hasPendingEdits: boolean;
}

export interface ArticleView {
  post: Post;
  photos: Record<string, PhotoInfo>;
  coverPhotoId: string | null;
  dek: string;
}

function pickFields(source: PostFields): PostFields {
  return {
    title: source.title,
    topic: source.topic,
    tags: source.tags,
    blocks: source.blocks,
    coverPhotoId: source.coverPhotoId,
    dek: source.dek,
    visibility: source.visibility,
  };
}

/** 발행 조건: 제목이 있고 블록이 하나 이상(FR4.4). */
export function checkPublishable(fields: PostFields): PublishResult | null {
  if (!fields.title.trim()) {
    return { ok: false, reason: 'title-required', message: TITLE_REQUIRED_MESSAGE };
  }
  if (fields.blocks.length === 0) {
    return { ok: false, reason: 'blocks-required', message: BLOCKS_REQUIRED_MESSAGE };
  }
  return null;
}

export function canView(post: Post, viewer: Viewer): boolean {
  return viewer === 'author' || isPubliclyVisible(post);
}

export function createPostService(deps: PostServiceDeps) {
  const { db, search, media } = deps;
  const now = deps.now ?? Date.now;
  const createId = deps.createId ?? (() => nanoid(12).replace(/[^A-Za-z0-9]/g, 'x'));

  async function requirePost(id: string): Promise<Post> {
    const post = await repo.getPostById(db, id);
    if (!post) throw new PostNotFoundError(id);
    return post;
  }

  async function photoMap(ids: string[]): Promise<Map<string, PhotoInfo>> {
    const records = await getPhotosByIds(db, ids);
    return new Map(records.map((record) => [record.id, toPhotoInfo(record)]));
  }

  async function toCards(posts: Post[]): Promise<PostCard[]> {
    const coverIds = posts.flatMap((post) => resolveCoverPhotoId(post) ?? []);
    const photos = await photoMap(coverIds);
    return posts.map((post) => toPostCard(post, photos));
  }

  /** 새 임시 저장 글을 만듭니다. */
  async function createDraft(initial: Partial<PostFields> & { slug?: string } = {}): Promise<Post> {
    const id = createId();
    const timestamp = now();
    const post: Post = {
      id,
      slug: initial.slug ?? id,
      title: initial.title ?? '',
      topic: initial.topic ?? DEFAULT_TOPIC,
      tags: initial.tags ?? [],
      blocks: initial.blocks ?? [],
      coverPhotoId: initial.coverPhotoId ?? null,
      dek: initial.dek ?? null,
      visibility: initial.visibility ?? 'public',
      status: 'draft',
      firstPublishedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await repo.insertPost(db, post);
    return post;
  }

  async function getForEditor(id: string): Promise<EditorPost | null> {
    const post = await repo.getPostById(db, id);
    if (!post) return null;
    const revision = await repo.getRevision(db, id);
    return {
      post,
      fields: pickFields(revision ?? post),
      hasPendingEdits: revision !== null,
    };
  }

  /**
   * 내용을 저장합니다. 아직 발행하지 않은 글은 글 자체에, 발행한 글은 작업 사본에만 저장합니다(FR4.5).
   */
  async function saveFields(
    id: string,
    input: unknown,
  ): Promise<{ savedAt: number; hasPendingEdits: boolean }> {
    const fields = parsePostFields(input);
    const savedAt = now();
    return db.transaction(async (tx) => {
      const post = await repo.getPostById(tx, id);
      if (!post) throw new PostNotFoundError(id);
      if (post.status === 'draft') {
        await repo.updatePost(tx, id, { ...fields, updatedAt: savedAt });
        return { savedAt, hasPendingEdits: false };
      }
      await repo.saveRevision(tx, { ...fields, postId: id, savedAt });
      await repo.updatePost(tx, id, { updatedAt: savedAt });
      return { savedAt, hasPendingEdits: true };
    });
  }

  /**
   * 발행 또는 다시 발행합니다. 넘겨받은 내용(없으면 사본, 그것도 없으면 글)을 발행본으로 옮기고 사본을 지웁니다.
   */
  async function publish(id: string, input?: unknown): Promise<PublishResult> {
    const current = await getForEditor(id);
    if (!current) throw new PostNotFoundError(id);
    const fields = input === undefined ? current.fields : parsePostFields(input);
    const problem = checkPublishable(fields);
    if (problem) return problem;
    const timestamp = now();
    const published: Post = {
      ...current.post,
      ...fields,
      status: 'published',
      firstPublishedAt: current.post.firstPublishedAt ?? timestamp,
      updatedAt: timestamp,
    };
    await db.transaction(async (tx) => {
      await repo.updatePost(tx, id, {
        ...fields,
        status: published.status,
        firstPublishedAt: published.firstPublishedAt,
        updatedAt: timestamp,
      });
      await repo.deleteRevision(tx, id);
      await search.syncPost(tx, published);
    });
    return { ok: true, post: published };
  }

  /** 고치던 사본을 버리고 발행본 내용으로 되돌립니다(FR4.5). */
  async function discardRevision(id: string): Promise<PostFields> {
    const post = await requirePost(id);
    await db.transaction(async (tx) => {
      await repo.deleteRevision(tx, id);
    });
    return pickFields(post);
  }

  /**
   * 공개 범위를 바꿉니다(FR5.1). 발행한 글은 작업 사본에 저장되어 다시 발행할 때 반영됩니다.
   */
  async function setVisibility(id: string, visibility: Visibility) {
    const current = await getForEditor(id);
    if (!current) throw new PostNotFoundError(id);
    return saveFields(id, { ...current.fields, visibility });
  }

  /** 글을 지웁니다(FR4.6). 데이터베이스에서 먼저 지우고, 성공한 뒤에 사진 파일을 지웁니다. */
  async function deletePost(id: string): Promise<void> {
    const photoIds = await db.transaction(async (tx) => {
      const post = await repo.getPostById(tx, id);
      if (!post) throw new PostNotFoundError(id);
      const revision = await repo.getRevision(tx, id);
      const ids = collectPhotoIds([...post.blocks, ...(revision?.blocks ?? [])]);
      for (const coverId of [post.coverPhotoId, revision?.coverPhotoId]) {
        if (coverId && !ids.includes(coverId)) ids.push(coverId);
      }
      await repo.deleteRevision(tx, id);
      await search.removePost(tx, id);
      await deletePhotos(tx, ids);
      await repo.deletePost(tx, id);
      return ids;
    });
    await media.deleteFiles(photoIds);
  }

  /** 글 본문 화면용. 독자에게는 발행된 공개 글만 돌려주고, 나머지는 null(찾을 수 없음)입니다(FR5.3). */
  async function getArticle(slug: string, viewer: Viewer): Promise<ArticleView | null> {
    const post = await repo.getPostBySlug(db, slug);
    if (!post || !canView(post, viewer)) return null;
    const photos = await photoMap(collectPhotoIds(post.blocks).concat(post.coverPhotoId ?? []));
    return {
      post,
      photos: Object.fromEntries(photos),
      coverPhotoId: resolveCoverPhotoId(post),
      dek: resolveDek(post),
    };
  }

  async function listPublic(query: repo.PublishedListQuery = {}) {
    const page = await repo.listPublishedPosts(db, query);
    return { ...page, cards: await toCards(page.posts) };
  }

  /** 첫 화면: 가장 최근 공개 글은 표지, 다음 두 편은 최신 글(FR7.2). */
  async function getHome(): Promise<{ cover: PostCard | null; latest: PostCard[] }> {
    const page = await repo.listPublishedPosts(db, { page: 1, pageSize: 3 });
    const cards = await toCards(page.posts);
    return { cover: cards[0] ?? null, latest: cards.slice(1, 3) };
  }

  async function searchPublic(query: string, pageNumber = 1) {
    const result = await search.search(db, query, { page: pageNumber });
    const posts = await repo.getPublishedPostsByIds(db, result.ids);
    return { ...result, cards: await toCards(posts) };
  }

  async function listForAuthor() {
    return repo.listPostsForAuthor(db);
  }

  async function topicCounts(): Promise<Record<Topic, number>> {
    return repo.countPublishedByTopic(db);
  }

  async function getEditorPhotos(fields: PostFields): Promise<Record<string, PhotoInfo>> {
    return Object.fromEntries(await photoMap(collectPhotoIds(fields.blocks)));
  }

  return {
    createDraft,
    getForEditor,
    saveFields,
    publish,
    discardRevision,
    setVisibility,
    deletePost,
    getArticle,
    listPublic,
    getHome,
    searchPublic,
    listForAuthor,
    topicCounts,
    getEditorPhotos,
  };
}

export type PostService = ReturnType<typeof createPostService>;
