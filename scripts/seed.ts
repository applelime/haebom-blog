import sharp from 'sharp';
import { loadLocalEnv } from '../src/lib/load-env';
import { storeUploadedPhoto } from '../src/lib/media/upload';
import type { Block, BlockPhoto } from '../src/lib/post/blocks';
import { getPostBySlug } from '../src/lib/post/repository';
import type { PostFields } from '../src/lib/post/types';
import { getRuntime, resetRuntime, type Runtime } from '../src/lib/runtime';

/**
 * 샘플 글 넣기(M1): `npm run seed`
 * 리스본 예시 글(블록 7종 모두 사용)과 첫 화면을 채울 짧은 글 두 편을 넣습니다.
 * 사진은 글자 없는 색 그라데이션 자리 이미지입니다. 이미 있는 샘플 글은 건너뜁니다.
 */

let photoCount = 0;

async function placeholderPhoto(
  runtime: Runtime,
  caption: string,
  colors: [string, string],
  size: [number, number],
): Promise<BlockPhoto> {
  const [width, height] = size;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${colors[0]}"/><stop offset="1" stop-color="${colors[1]}"/>
    </linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
  </svg>`;
  const data = await sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer();
  photoCount += 1;
  const record = await storeUploadedPhoto(
    { db: runtime.database.db, media: runtime.media },
    { name: `sample-${photoCount}.jpg`, type: 'image/jpeg', size: data.length, data },
  );
  return { photoId: record.id, caption };
}

const WIDE: [number, number] = [2400, 1029];
const LANDSCAPE: [number, number] = [2400, 1600];
const PORTRAIT: [number, number] = [1600, 2000];

async function lisbonFields(runtime: Runtime): Promise<PostFields> {
  const photo = (caption: string, colors: [string, string], size = LANDSCAPE) =>
    placeholderPhoto(runtime, caption, colors, size);
  const blocks: Block[] = [
    {
      id: 'lisbon-full',
      type: 'photo-full',
      photos: [
        await photo('해 질 녘 리스본 지붕들 너머로 보이는 테주 강', ['#d9a46b', '#5b6f8a'], WIDE),
      ],
      caption: '상 조르즈 성에서 내려다본 알파마 지구.',
    },
    {
      id: 'lisbon-text-1',
      type: 'text',
      heading: '',
      text: '첫날 아침, 숙소 앞 정류장에서 28번 트램을 기다렸다. 관광객으로 가득 찬 차량을 두 대 보내고 나서야 나는 걷기로 마음을 바꿨다. 트램이 지나가는 길을 그대로 따라가면 도시의 굵은 줄기를 놓치지 않을 거라고 생각했다.\n\n오르막은 생각보다 가팔랐다. 대신 숨을 고르려 멈출 때마다 골목 끝으로 강이 보였다.',
    },
    {
      id: 'lisbon-body',
      type: 'photo-body',
      photos: [
        await photo('차와 사람이 겨우 비켜 가는 골목을 트램이 천천히 지나간다.', [
          '#e8c547',
          '#8a7a5c',
        ]),
      ],
      caption: '',
    },
    {
      id: 'lisbon-quote',
      type: 'quote',
      text: '같은 골목을 이틀 연속 걸으니, 어제와 달라진 창이 눈에 들어왔다.',
    },
    {
      id: 'lisbon-text-2',
      type: 'text',
      heading: '창가의 도시',
      text: '리스본의 창문에는 저마다 무언가가 걸려 있었다. 빨래, 화분, 손으로 쓴 안내문. 창마다 사는 사람의 하루가 조금씩 새어 나와 있었다.',
    },
    {
      id: 'lisbon-row',
      type: 'photo-row',
      photos: [
        await photo('빨래가 걸린 창문', ['#c9d6df', '#7d8b95'], PORTRAIT),
        await photo('화분이 놓인 창틀', ['#a9c39a', '#5d7350'], PORTRAIT),
        await photo('푸른 타일로 장식된 벽', ['#7fa7c9', '#2f4f6f'], PORTRAIT),
      ],
      caption: '알파마 골목의 창문들.',
    },
    {
      id: 'lisbon-side',
      type: 'photo-side',
      photos: [await photo('에그타르트 여섯 개가 담긴 상자', ['#f0d08a', '#b07a3a'], PORTRAIT)],
      caption: '',
      heading: '한 상자에 여섯 개',
      text: '벨렝 지구의 오래된 빵집 앞 줄은 생각보다 빨리 줄었다. 갓 구운 에그타르트 위에 계피 가루를 뿌리고, 강가 벤치에 앉아 두 개를 먼저 먹었다.\n\n남은 네 개는 숙소에 돌아가는 길에 다 사라졌다.',
      reversed: true,
    },
    {
      id: 'lisbon-gallery',
      type: 'photo-gallery',
      photos: [
        await photo('전망대에서 본 시내', ['#e6b980', '#8e6e53']),
        await photo('강변의 노을', ['#f6a96b', '#7b3f61']),
        await photo('광장의 분수', ['#b8d0e0', '#5e7f96']),
        await photo('골목 계단', ['#d8c3a5', '#8e8d8a']),
        await photo('시장의 생선 가게', ['#9fc5c0', '#3f6e6a']),
        await photo('공항으로 가는 지하철', ['#bdbdbd', '#4a4a4a']),
      ],
      caption: '마지막 날, 공항으로 가기 전까지.',
    },
    {
      id: 'lisbon-text-3',
      type: 'text',
      heading: '',
      text: '사흘 동안 트램은 결국 두 번밖에 타지 않았다. 그래도 노선도를 펼치면 걸었던 길이 전부 떠오른다.',
    },
  ];
  return {
    title: '리스본, 노란 트램을 따라 걸은 사흘',
    topic: 'travel',
    tags: ['리스본', '트램', '도보여행'],
    blocks,
    coverPhotoId: null,
    dek: '언덕이 많은 도시에서는 길을 잃는 것도 일정이 된다. 28번 트램 노선을 따라 걸으며 만난 골목과 창가의 기록.',
    visibility: 'public',
  };
}

async function shortFields(
  runtime: Runtime,
  sample: {
    title: string;
    topic: PostFields['topic'];
    tags: string[];
    text: string;
    caption: string;
    colors: [string, string];
  },
): Promise<PostFields> {
  return {
    title: sample.title,
    topic: sample.topic,
    tags: sample.tags,
    blocks: [
      {
        id: 'short-photo',
        type: 'photo-body',
        photos: [await placeholderPhoto(runtime, sample.caption, sample.colors, LANDSCAPE)],
        caption: '',
      },
      { id: 'short-text', type: 'text', heading: '', text: sample.text },
    ],
    coverPhotoId: null,
    dek: null,
    visibility: 'public',
  };
}

async function publishSample(
  runtime: Runtime,
  slug: string,
  buildFields: () => Promise<PostFields>,
  publishedAt: number,
) {
  if (await getPostBySlug(runtime.database.db, slug)) {
    console.log(`이미 있는 샘플 글이라 건너뜁니다: /posts/${slug}`);
    return;
  }
  const fields = await buildFields();
  const draft = await runtime.posts.createDraft({ slug });
  const result = await runtime.posts.publish(draft.id, fields);
  if (!result.ok) throw new Error(`샘플 글을 발행하지 못했습니다: ${result.message}`);
  // 첫 화면 순서를 시안과 맞추려고 처음 발행 날짜를 정해 둡니다.
  await runtime.database.client.execute({
    sql: 'UPDATE posts SET first_published_at = ? WHERE id = ?',
    args: [publishedAt, draft.id],
  });
  await runtime.database.client.execute({
    sql: 'UPDATE search_documents SET first_published_at = ? WHERE post_id = ?',
    args: [publishedAt, draft.id],
  });
  console.log(`샘플 글을 넣었습니다: /posts/${slug}`);
}

async function main(): Promise<void> {
  loadLocalEnv();
  const runtime = await getRuntime();
  await publishSample(
    runtime,
    'bread-baguette',
    () =>
      shortFields(runtime, {
        title: '동네 빵집 세 곳의 바게트 비교',
        topic: 'taste',
        tags: ['빵', '동네'],
        text: '껍질, 속, 다음 날까지 버티는지. 세 가지 기준으로 일주일 동안 매일 아침 바게트를 샀다.',
        caption: '나무 도마 위에 놓인 바게트 세 개',
        colors: ['#e0b77a', '#8a5a14'],
      }),
    new Date(2026, 9, 28).getTime(),
  );
  await publishSample(
    runtime,
    'rainy-tuesday',
    () =>
      shortFields(runtime, {
        title: '비 오는 화요일의 창가 자리',
        topic: 'daily',
        tags: ['카페', '비'],
        text: '단골 카페 창가에서 보낸 오후 세 시간. 빗소리가 커질 때마다 사람들은 같은 쪽으로 고개를 돌렸다.',
        caption: '비 내리는 창가에 놓인 커피잔',
        colors: ['#9aa9b5', '#3e4a55'],
      }),
    new Date(2026, 10, 2).getTime(),
  );
  await publishSample(
    runtime,
    'lisbon-three-days',
    () => lisbonFields(runtime),
    new Date(2026, 10, 4).getTime(),
  );
  await resetRuntime();
}

main().catch(async (error: unknown) => {
  console.error('샘플 글을 넣지 못했습니다.', error);
  await resetRuntime();
  process.exit(1);
});
