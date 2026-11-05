// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { insertPhoto } from '@/lib/media/repository';
import type { PhotoRecord } from '@/lib/media/types';
import { getPostById, getRevision } from '@/lib/post/repository';
import {
  BLOCKS_REQUIRED_MESSAGE,
  createPostService,
  TITLE_REQUIRED_MESSAGE,
  type PostService,
} from '@/lib/post/service';
import { bodyBlock, galleryBlock, photoRef, postFields, textBlock } from '../factories';
import { openTempDatabase, type TempDatabase } from '../helpers/temp-db';

let database: TempDatabase;
let service: PostService;
let clock: number;
const search = { syncPost: vi.fn(), removePost: vi.fn(), search: vi.fn() };
const media = { deleteFiles: vi.fn() };

function photoRecord(id: string): PhotoRecord {
  return {
    id,
    originalFile: `${id}.jpg`,
    format: 'jpeg',
    width: 3000,
    height: 2000,
    sizeBytes: 1000,
    variants: [480, 960, 1600, 2400],
    createdAt: 1,
  };
}

async function publishedPost(fields = postFields()) {
  const draft = await service.createDraft();
  const result = await service.publish(draft.id, fields);
  if (!result.ok) throw new Error(result.message);
  return result.post;
}

beforeEach(async () => {
  database = await openTempDatabase('post-service');
  clock = 1_000;
  vi.clearAllMocks();
  service = createPostService({
    db: database.db,
    search,
    media,
    now: () => (clock += 10),
  });
});

afterEach(() => {
  database.cleanup();
});

describe('PostContent 업무 규칙', () => {
  it('제목이 비어 있으면 발행하지 않고 "제목을 입력해 주세요."를 돌려준다 (FR4.4)', async () => {
    const draft = await service.createDraft();
    const result = await service.publish(draft.id, postFields({ title: '   ' }));
    expect(result).toEqual({
      ok: false,
      reason: 'title-required',
      message: TITLE_REQUIRED_MESSAGE,
    });
    expect((await getPostById(database.db, draft.id))?.status).toBe('draft');
    expect(search.syncPost).not.toHaveBeenCalled();
  });

  it('블록이 하나도 없으면 발행하지 않는다', async () => {
    const draft = await service.createDraft();
    const result = await service.publish(draft.id, postFields({ blocks: [] }));
    expect(result).toEqual({
      ok: false,
      reason: 'blocks-required',
      message: BLOCKS_REQUIRED_MESSAGE,
    });
  });

  it('발행한 글을 고쳐 저장하면 작업 사본에만 남고 독자에게는 이전 내용이 보인다 (FR4.5)', async () => {
    const post = await publishedPost(postFields({ title: '처음 발행한 제목' }));
    const saved = await service.saveFields(post.id, postFields({ title: '고치는 중인 제목' }));
    expect(saved.hasPendingEdits).toBe(true);

    const article = await service.getArticle(post.slug, 'reader');
    expect(article?.post.title).toBe('처음 발행한 제목');
    const editor = await service.getForEditor(post.id);
    expect(editor?.fields.title).toBe('고치는 중인 제목');
    expect(editor?.hasPendingEdits).toBe(true);
  });

  it('다시 발행하면 고친 내용이 독자에게 반영되고 사본은 지워지며, 처음 발행 날짜는 그대로다', async () => {
    const post = await publishedPost(postFields({ title: '처음 제목' }));
    await service.saveFields(post.id, postFields({ title: '고친 제목' }));
    const result = await service.publish(post.id);
    expect(result.ok).toBe(true);
    const article = await service.getArticle(post.slug, 'reader');
    expect(article?.post.title).toBe('고친 제목');
    expect(article?.post.firstPublishedAt).toBe(post.firstPublishedAt);
    expect(await getRevision(database.db, post.id)).toBeNull();
    expect(search.syncPost).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ id: post.id, title: '고친 제목' }),
    );
  });

  it('고친 내용을 버리면 사본이 사라지고 발행본 내용으로 되돌아간다', async () => {
    const post = await publishedPost(postFields({ title: '발행본' }));
    await service.saveFields(post.id, postFields({ title: '버릴 사본' }));
    const restored = await service.discardRevision(post.id);
    expect(restored.title).toBe('발행본');
    const editor = await service.getForEditor(post.id);
    expect(editor?.hasPendingEdits).toBe(false);
    expect(editor?.fields.title).toBe('발행본');
  });

  it('비공개 글은 독자에게 찾을 수 없음(null)이고, 글쓴이에게는 보인다 (FR5.2, FR5.3)', async () => {
    const post = await publishedPost(postFields({ visibility: 'private' }));
    const draft = await service.createDraft({ title: '임시 저장 글' });
    expect(await service.getArticle(post.slug, 'reader')).toBeNull();
    expect(await service.getArticle(draft.slug, 'reader')).toBeNull();
    expect(await service.getArticle('no-such-post', 'reader')).toBeNull();
    expect((await service.getArticle(post.slug, 'author'))?.post.id).toBe(post.id);
    expect((await service.listPublic()).posts).toHaveLength(0);
    expect(search.syncPost).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: post.id, visibility: 'private' }),
    );
  });

  it('대표 사진과 소개 문장은 첫 사진과 첫 문장을 쓰고, 직접 지정하면 그 값을 쓴다 (FR8.1, FR8.2)', async () => {
    await insertPhoto(database.db, photoRecord('first'));
    await insertPhoto(database.db, photoRecord('second'));
    const blocks = [
      textBlock('언덕이 많은 도시에서는 길을 잃는 것도 일정이 된다. 둘째 문장.'),
      bodyBlock(photoRef('first', '첫 사진')),
      bodyBlock(photoRef('second', '둘째 사진')),
    ];
    const automatic = await publishedPost(postFields({ blocks }));
    const autoHome = await service.getHome();
    expect(autoHome.cover?.cover?.id).toBe('first');
    expect(autoHome.cover?.cover?.alt).toBe('첫 사진');
    expect(autoHome.cover?.dek).toBe('언덕이 많은 도시에서는 길을 잃는 것도 일정이 된다.');

    await service.publish(
      automatic.id,
      postFields({ blocks, coverPhotoId: 'second', dek: '직접 쓴 소개' }),
    );
    const article = await service.getArticle(automatic.slug, 'reader');
    expect(article?.coverPhotoId).toBe('second');
    expect(article?.dek).toBe('직접 쓴 소개');
  });

  it('사진이 없는 글은 대표 사진 없이 제목과 소개 문장만 쓴다 (FR8.3)', async () => {
    await publishedPost(postFields({ blocks: [textBlock('사진 없는 글입니다. 끝.')] }));
    const home = await service.getHome();
    expect(home.cover?.cover).toBeNull();
    expect(home.cover?.title).toBe(postFields().title);
    expect(home.cover?.dek).toBe('사진 없는 글입니다.');
  });

  it('글을 지우면 데이터베이스에서 먼저 지우고, 그 뒤 쓰던 사진 파일을 지우라고 요청한다 (FR4.6)', async () => {
    await insertPhoto(database.db, photoRecord('ph-del'));
    const post = await publishedPost(
      postFields({ blocks: [galleryBlock(0), bodyBlock(photoRef('ph-del'))] }),
    );
    media.deleteFiles.mockImplementation(async () => {
      expect(await getPostById(database.db, post.id)).toBeNull();
    });
    await service.deletePost(post.id);
    expect(search.removePost).toHaveBeenCalledWith(expect.anything(), post.id);
    expect(media.deleteFiles).toHaveBeenCalledWith(['ph-del']);
  });
});
