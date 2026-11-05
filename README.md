# 매거진형 개인 블로그

개인의 경험을 매거진처럼 읽히는 글로 기록하는 사이트입니다. 글마다 사진 배치 블록(화면 폭 사진, 본문 폭 사진, 2~3장 나란히, 사진과 글 나란히, 여러 장 모아 보기)과 글, 인용문 블록을 골라 씁니다.

첫 버전은 글쓴이 컴퓨터에서만 실행합니다. 인터넷에 공개하는 방법은 [공개 계획 문서](docs/publishing-plan.md)에 있습니다.

## 준비

- Node.js 20.12 이상 (`node --version`으로 확인)
- 처음 한 번 패키지 설치:

```bash
npm install
```

## 실행

```bash
npm run dev
```

- 브라우저에서 <http://localhost:3000>을 엽니다.
- 위쪽 메뉴의 "글쓰기"로 내 글 목록과 에디터를 엽니다. "글쓰기"는 이 컴퓨터에서 `localhost` 주소로 열었을 때만 보입니다.
- 끄려면 터미널에서 `Ctrl+C`를 누릅니다.

빠른 실행 모드로 쓰려면 한 번 빌드한 뒤 실행합니다.

```bash
npm run build
npm start
```

## 샘플 글 넣기

```bash
npm run seed
```

리스본 예시 글(블록 7종을 모두 쓴 글)과 첫 화면을 채울 짧은 글 두 편이 들어갑니다. 사진은 색 그라데이션 자리 이미지입니다. 다시 실행해도 이미 있는 샘플 글은 건너뜁니다.

- 첫 화면: <http://localhost:3000>
- 샘플 글: <http://localhost:3000/posts/lisbon-three-days>

## 휴대폰으로 보기

컴퓨터와 휴대폰이 같은 와이파이에 있으면 휴대폰에서 읽는 화면을 볼 수 있습니다.

1. `npm run dev`로 실행합니다. 서버는 기본으로 모든 네트워크 주소(0.0.0.0)에서 듣습니다.
2. 컴퓨터의 와이파이 주소를 확인합니다. macOS에서는 시스템 설정 > 와이파이 > 연결된 네트워크의 세부 사항에서 볼 수 있습니다(예: `192.168.0.10`).
3. 휴대폰 브라우저에서 `http://192.168.0.10:3000`을 엽니다.

휴대폰에서는 읽기만 됩니다. 글쓰기 버튼이 보이지 않고, 글쓰기 화면 주소나 비공개 글 주소로 들어가면 "글을 찾을 수 없습니다."가 보입니다. 처음 실행할 때 macOS가 들어오는 연결을 허용할지 물으면 허용해야 휴대폰에서 열립니다.

## 검사

테스트, 코드 검사(ESLint), 형식 검사(Prettier)를 한 번에 돌립니다. GitHub에 올리기 전에는 이 명령으로 확인합니다.

```bash
npm run check
```

따로 돌릴 때:

```bash
npm test               # 테스트(Vitest)
npm run lint           # ESLint
npm run format:check   # Prettier 형식 확인 (고치려면 npm run format)
npm run typecheck      # TypeScript 타입 확인
npm run test:coverage  # 테스트와 커버리지 (결과: coverage/index.html, 하한 없음)
npm run test:browser   # 실제 브라우저(Chrome) 확인. 먼저 npm run build
npm run audit:app      # 앱이 쓰는 패키지의 심각(critical) 취약점 검사
```

### 올리기 전 자동 검사와 GitHub Actions

- `npm install`을 하면 `git push` 직전에 `npm run check`를 돌리는 훅(`.githooks/pre-push`)이 설치됩니다. 검사가 실패하면 올라가지 않습니다.
- GitHub에 올린 뒤에는 `.github/workflows/ci.yml`이 같은 검사에 더해 타입 확인, 커버리지, 빌드, 실제 브라우저 확인, 패키지 취약점 검사를 돌립니다. 실패하면 GitHub의 Actions 탭과 메일로 알 수 있습니다.

## 설정

`.env.example`을 `.env`로 복사해 값을 바꿀 수 있습니다. 비밀 값은 없습니다.

| 이름                    | 기본값              | 뜻                                                |
| ----------------------- | ------------------- | ------------------------------------------------- |
| `DATABASE_URL`          | `file:data/blog.db` | 글 데이터베이스(SQLite 파일)                      |
| `UPLOAD_DIR`            | `uploads`           | 사진 원본과 크기별 사진 폴더                      |
| `PORT`                  | `3000`              | 서버 포트                                         |
| `BLOG_PUBLIC_MODE`      | (없음)              | `1`이면 글쓴이 판단을 끄고 글쓰기를 모두 막습니다 |
| `NEXT_PUBLIC_SITE_NAME` | `[SITE NAME]`       | 사이트 이름                                       |

## 데이터와 백업

- 글은 `data/blog.db`, 사진은 `uploads/originals`(원본)와 `uploads/variants`(폭 480, 960, 1600, 2400 WebP)에 있습니다.
- 두 폴더는 git에 올리지 않습니다(개인 글이 저장소에 올라가지 않도록). 백업하려면 프로그램을 끈 뒤 `data/`와 `uploads/` 폴더를 통째로 복사합니다.

## 폴더 구성

| 폴더                      | 내용                                                                              |
| ------------------------- | --------------------------------------------------------------------------------- |
| `server.ts`               | 블로그를 실행하는 Node 서버. 글쓴이 판단 머리글을 정합니다                        |
| `src/app`                 | 화면과 경로(Next.js App Router). `(reader)`는 읽는 화면, `(author)`는 글쓴이 화면 |
| `src/components`          | 블록 그리기, 머리말, 에디터, 내 글 목록 부품                                      |
| `src/lib/post`            | 글, 블록, 발행, 작업 사본 규칙(PostContent)                                       |
| `src/lib/media`           | 사진 검사, 크기별 사진 만들기(Media)                                              |
| `src/lib/search`          | 검색(Search)                                                                      |
| `src/lib/access`          | 글쓴이 판단                                                                       |
| `src/lib/db`              | 데이터베이스 표와 연결                                                            |
| `scripts/seed.ts`         | 샘플 글 넣기                                                                      |
| `tests`                   | 단위 테스트와 통합 테스트                                                         |
| `docs/publishing-plan.md` | 인터넷 공개 계획                                                                  |
