# PROJECT

법률 마케팅(개인회생·형사사건) 콘텐츠 파이프라인 도구. 단일 HTML 앱(`index.html`)
+ Vercel 서버리스 함수(`api/`)로 구성된다. 자세한 배포/환경변수 이력은
`CLAUDE.md`, 폴더 구조는 `README.md`를 참고.

## 핵심 파이프라인

1. **칼럼 재구성** — 원본(텍스트/URL/유튜브 자막) → AI가 재작성한 칼럼 →
   **Notion 업로드(기본 발행 경로)** → 사용자가 Notion에서 최종 수정 → 네이버
   블로그 등에 직접 발행. (2026-09-16부터 기본 흐름, `docs/PRODUCT_VISION.md`
   참고)
2. **카드뉴스** — 원본 또는 직접 입력 → 대본 초안 → 슬라이드 이미지 생성/편집 →
   ZIP 다운로드 / Notion 업로드(대본만).
3. **릴스 대본** — 재작성된 칼럼을 30~45초 숏폼 대본으로 각색.

## 코드 위치

- `index.html` — 전체 UI + 클라이언트 로직 (가상 DOM 없이 `render()`가
  `#app.innerHTML`을 통째로 다시 그리는 구조, 스크롤 보존 주의사항은
  `CLAUDE.md` 참고).
- `api/ai.js` — Anthropic API 호출 (API 키는 서버에만).
- `api/notion.js` — Notion 업로드 + (레거시) 노션→예쁜 공개 페이지 발행.
- `api/p/[slug].js`, `lib/renderColumnPage.js`, `lib/notionToHtml.js`,
  `lib/sanitizeColumnBody.js`, `api/publish-page.js` — Apple 스타일 공개
  페이지(`/c/:slug`) 관련 레거시 코드. 현재 핵심 방향에서 제외됐지만 기존
  링크/데이터 호환을 위해 유지 (`docs/PRODUCT_VISION.md` 참고).

## 현재 작업

진행 중/완료된 작업 명세는 `docs/tasks/`에 기록한다. 가장 최근: 칼럼 품질 +
Notion 업로드 구조화 (`docs/tasks/column-notion-quality.md`).
