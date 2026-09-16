# 작업 명세 · 칼럼 재생산 → Notion 업로드 품질 개선

작성일: 2026-09-16
관련 커밋: 이 문서 다음 커밋들 참고

## 0. 요약

칼럼 생성 파이프라인의 핵심 산출물 품질(AI가 쓰는 글 자체)과, 그 결과를 Notion에
업로드했을 때 사람이 바로 다듬을 수 있는 문서로 보이는지를 개선한다. "예쁜 공개
페이지(Apple 스타일)"는 이번 작업에서 핵심 방향이 아니므로 기본 흐름에서 숨기되,
기존 데이터/URL은 그대로 유지한다.

## 1. 현재 문제

- `generateRewrittenColumn()` (index.html)이 AI에게 `###TITLE###/###BODY###/###KEYPOINTS###/###TAGS###`
  태그 구분자로만 응답하게 시켜서, 결과가 "제목 + 평문 문단 뭉치"로만 나온다.
  소제목·목록·강조 구조가 전혀 없다.
- 프롬프트(`writingPersonaPrompt` + 태그 인라인 지시)가 원문 충실성, 편집 품질,
  문체 규칙을 한 덩어리로 섞어서 관심사가 분리돼 있지 않다.
- `api/notion.js`는 `body`를 `\n{2,}`로 쪼갠 뒤 전부 `paragraph` 블록으로만 만든다.
  소제목, 목록, 콜아웃 등 Notion 문서 구조가 전혀 반영되지 않는다.
- `children.slice(0, 100)`으로 Notion 페이지 생성 시 블록을 조용히 잘라서, 100개
  넘는 긴 칼럼은 뒷부분이 그냥 사라진다 (사용자에게 알림 없음).
- 핵심 포인트가 AI에게 "본문에서 잘라 붙이지 말라"는 지시 없이 생성돼서 본문과
  중복되기 쉽다.
- 같은 프로젝트를 여러 번 Notion에 업로드하면 매번 새 페이지가 생긴다 (현재 동작,
  이번 작업에서 임의로 바꾸지 않음 — 8절 참고).
- "예쁜 페이지로 발행"(`노션 내용으로 발행` 버튼, `/c/:slug`)이 기본 CTA 자리에
  Notion 업로드와 동급으로 노출돼서, 사용자가 어느 쪽이 "진짜 발행"인지 혼란을
  겪을 수 있다.

## 2. 변경할 사용자 흐름

```
원본 입력(텍스트/URL/유튜브)
  → AI가 구조화된 칼럼 생성 (제목/부제/도입/소제목별 섹션/핵심 포인트/결론/태그)
  → 화면에서 제목·본문 확인 (필요하면 평문으로 가볍게 수정)
  → "노션에 업로드" (기본 CTA) → Notion 페이지가 heading/paragraph/bullet/callout으로 구조화되어 생성됨
  → Notion 페이지 열기 → 사용자가 Notion에서 제목·본문·이미지를 최종 수정
  → 사용자가 네이버 블로그 등에 직접 발행
```

"노션 내용으로 발행"(예쁜 공개 페이지, `/c/:slug`)은 위 기본 흐름에서 제거하고,
접힌 "레거시 기능" 영역으로 이동한다. 기존에 이미 발행된 `/c/:slug` 링크와
`api/p/[slug].js`, `lib/renderColumnPage.js`, `lib/notionToHtml.js`,
`api/publish-page.js`는 삭제하지 않고 그대로 둔다.

## 3. 글 품질 기준

사용자 요청 원문에 있는 15개 기준(원문 사실·논지 보존, 문장 구조 새로 쓰기, 하나의
중심 메시지, 독자 관점 도입, 논리적 소제목 순서, 구체적 조건·수치 유지, 반복 지양,
상투적 문장 지양, AI 말투 지양, 결론에서 판단 기준 제시, 키워드 과반복 금지, 광고
규정 위반 표현 금지, 사용자 스타일 가이드 우선, 분야 하드코딩 금지, 분야별 안전
규칙과 문체 설정 구분)을 프롬프트에 아래 5개 관심사로 나눠서 반영한다:

1. **source fidelity rules** — 원문에 없는 사실/수치/판례/인용 생성 금지, 예외 조건
   보존, 불확실한 내용을 사실처럼 단정하지 않기.
2. **editorial quality rules** — 사람 편집자가 재구성한 것처럼, 상투적 서론/결론·
   AI 말투 회피, 문단 길이 다양화.
3. **structure rules** — 도입/소제목 2~5개/주의점(근거 있을 때만)/결론, 길이는
   원문 분량에 맞춰 가변적.
4. **style guide (사용자 설정)** — `state.styleGuide`가 있으면 최우선 적용 (기존
   `writingPersonaPrompt`가 이미 이 역할을 함, 유지).
5. **compliance/safety rules** — 결과 보장·과장 표현·허위 긴급성·광고 규정 위반
   표현 금지 (기존 `writingPersonaPrompt` 앞부분, 유지).

우선순위 충돌 해결 규칙(프롬프트에 명시):
- "원문 충실" vs "새 문장으로 재구성": **사실·논지·조건은 원문 그대로, 문장·문단
  표현은 전부 새로 씀** (기존 방식과 동일, 유지).
- "사용자 말투 우선" vs "광고 표현 제한": **광고 규정·사실 왜곡 금지는 문체와
  무관하게 항상 최우선** (기존 `writingPersonaPrompt` 서두에 이미 명시돼 있음, 유지).
- "구체적으로 작성" vs "원문에 없는 내용 생성 금지": **구체성은 원문에 실제로 있는
  조건·수치·사례에서만 끌어옴, 없으면 추상적으로 두거나 분량을 줄임**.
- "구조화된 글" vs "모든 글을 같은 틀로 만들지 않기": **의미 구조(도입/섹션/결론)는
  항상 있지만, 섹션 개수·문단 길이·목록 사용 여부는 원문 분량에 맞춰 AI가 정함**
  (섹션 개수를 2~5개 범위로만 강제하고 구체적 개수는 강제하지 않음).

## 4. 출력 데이터 구조

AI에게 아래 JSON 스키마로만 응답하게 하고(코드블록/설명 금지 지시 + 파싱 시
코드블록·설명이 붙어도 견고하게 처리), 코드가 검증 후 내부 구조로 변환한다.

```json
{
  "title": "string",
  "subtitle": "string (없으면 빈 문자열)",
  "introduction": "string (문단 여러 개면 \\n\\n로 구분)",
  "sections": [
    {
      "heading": "string",
      "paragraphs": ["string", "..."],
      "bullets": ["string", "..."],
      "callout": "string (없으면 필드 생략 가능)"
    }
  ],
  "keyPoints": ["string x 3~5"],
  "conclusion": "string",
  "tags": ["string x 3~7"]
}
```

파싱 방어 처리(`parseStructuredColumnJSON`, index.html):
- 코드블록(```json ... ``` 또는 ``` ... ```)이 앞뒤에 붙어도 안쪽 JSON만 추출.
- 앞뒤에 설명 문장이 붙어도 균형 괄호 매칭으로 최상위 `{...}` 객체만 추출
  (기존 `extractJSONBlock`의 `indexOf("{")~lastIndexOf("}")`보다 안전).
- 필드 누락 시 기본값(빈 문자열/빈 배열)으로 채움.
- 배열 기대 필드(`sections[].paragraphs`, `sections[].bullets`, `keyPoints`,
  `tags`)에 문자열이 오면 줄바꿈/쉼표 기준으로 배열화.
- JSON.parse 실패 시 사용자에게 "AI 응답을 표준 형식으로 읽지 못했어요. 다시
  시도해주세요." 같은 한국어 에러를 던짐 (원문 노출 없이 재시도 유도).

`state.pipeline.rewrittenColumn`에는 기존 필드(`title`, `body`, `keyPoints`,
`tags`)를 그대로 유지하고, 신규 필드를 추가한다:
- `subtitle`: string
- `structured`: `{ introduction, sections, conclusion }` — 생성 직후에만 채워짐.
  본문 텍스트영역을 사용자가 수정하면(원래 생성된 body와 달라지면) `null`로
  무효화해서, Notion 업로드 시 "수정된 평문"과 "생성 당시 구조"가 어긋나는 것을
  막는다 (5절 참고).
- `body`는 `structured`를 이어붙인 평문 텍스트로 계산해서 그대로 유지 —
  카드뉴스/릴스/복사/프로젝트 저장이 지금처럼 문자열로 계속 동작.

## 5. Notion 블록 매핑

`api/notion.js`가 요청 body에 `structured` 필드가 있으면 새 매핑을 쓰고, 없으면
(기존 저장 프로젝트, 카드뉴스, 릴스 등 기존 호출부) 지금과 동일한 평문 문단 분리
로직을 그대로 쓴다.

새 매핑 (`buildStructuredChildren`):
- `subtitle` → 제목 바로 아래 짧은 콜아웃 1개(있을 때만).
- `keyPoints` → `heading_3` "핵심 포인트" + `bulleted_list_item` 목록.
- `introduction` → `paragraph`(들).
- `sections[].heading` → `heading_2`.
- `sections[].paragraphs` → `paragraph`(들).
- `sections[].bullets` → `bulleted_list_item`(들). (번호가 의미 있는 절차임을
  나타내는 별도 플래그는 이번 범위에서 추가하지 않음 — 10절 "하지 않는 것" 참고.
  현재는 전부 bulleted로 매핑.)
- `sections[].callout` → `callout` 블록. 문서 전체에서 콜아웃은 최대 2개까지만
  실제 callout 블록으로 만들고, 그 이상은 일반 `paragraph`(굵게 표시용 텍스트
  접두어 없이 그대로)로 강등해서 "콜아웃 남발" 방지.
- `conclusion` → `paragraph`(들).
- `tags` → 맨 아래 `divider` + `paragraph`(`#태그` 나열).
- `extraSections`(릴스 대본 등 기존 기능) → 기존 로직 그대로 유지.

블록/텍스트 길이 제한 처리:
- `richText()`의 2000자 청크 분할은 그대로 유지.
- `children.slice(0, 100)`으로 조용히 자르던 부분을 제거. 대신:
  1. 페이지 생성 요청에는 처음 100개 블록만 포함해서 페이지를 만들고,
  2. 남은 블록이 있으면 `PATCH /v1/blocks/{page_id}/children`으로 100개씩
     나눠서 순차적으로 추가 요청을 보낸다.
  3. 추가 요청 중 하나가 실패하면, 이미 만들어진 페이지 URL과 "일부 내용은
     Notion 블록 제한 때문에 추가하지 못했어요. 페이지 링크: ..." 같은 한국어
     에러를 함께 응답에 담아 사용자에게 알린다 (조용히 유실시키지 않음).

## 6. 기존 데이터 호환 방식

- 저장된 프로젝트(`state.columnProjects[].rewrittenColumn`)에 `structured`
  필드가 없는 게 정상 — 그런 경우 Notion 업로드는 기존 평문 분리 로직으로 동작.
- `rewrittenColumn.body`는 항상 문자열로 유지되므로 카드뉴스 입력(`generateCardBaseContent`는
  별도 파이프라인이라 영향 없음), 릴스 대본 생성(`generateReelsScriptFn`이 `c.body`
  사용), 복사 버튼, 프로젝트 저장/불러오기 전부 지금과 동일하게 동작.
- 기존 태그 구분자(`###TITLE###` 등) 응답 형식은 더 이상 칼럼 재작성에는 안 쓰지만,
  카드뉴스 대본(`generateCardBaseContent`)·카드뉴스 아웃라인(`generateCardOutline`)·
  릴스 대본(`generateReelsScriptFn`)은 이번 작업 범위가 아니므로 그대로 둔다.
- 기존 `/c/:slug` 공개 페이지, `api/p/[slug].js`, `lib/renderColumnPage.js`,
  `lib/notionToHtml.js`, `api/publish-page.js`, `lib/sanitizeColumnBody.js`는
  코드/데이터 모두 그대로 유지. UI에서 진입 버튼만 접어서 숨긴다.

## 7. 변경 파일 예상 목록

- `index.html` — 프롬프트 재구성, `generateRewrittenColumn`, 신규 파서, 결과 화면
  UI(기본 CTA 정리, 레거시 발행 버튼 접기), Notion 업로드 payload에 `structured` 포함.
- `api/notion.js` — 구조화 블록 매핑, 100개 초과 블록 추가 요청 처리.
- `README.md` — 노션 연동 섹션에 구조화 매핑 설명 한 줄 보강(선택).
- `docs/OWNER_CONTEXT.md`, `docs/PRODUCT_VISION.md`, `docs/ROADMAP.md`,
  `docs/PROJECT.md` — 신규 작성(기존에 없었음), 제품 방향 반영.
- `docs/tasks/column-notion-quality.md` — 본 문서.

## 8. 다음 작업으로 미룬 것 (범위 밖)

- 같은 프로젝트를 여러 번 Notion에 업로드할 때 기존 페이지를 갱신(update)하는
  대신 계속 새 페이지가 생기는 문제 — `notionPageId`를 저장해서 업데이트하는
  방식은 Notion API의 "기존 페이지 children을 안전하게 교체"가 생각보다
  까다로워서(기존 블록 삭제·재작성 필요, 사용자가 노션에서 직접 고친 내용을
  덮어쓸 위험) 범위가 커진다. 다음 작업으로 미룸.
- `sections[].bullets`를 절차형(번호 목록)으로 표시할지 여부를 AI가 직접
  지정하게 하는 기능(`numbered` 플래그) — 이번에는 전부 bulleted로 고정.
- 인용(quote) 블록 자동 생성 — 원문에 실제 인용구가 있는지 신뢰성 있게 판별하는
  로직은 이번 범위에 넣지 않음 (AI가 반환하는 구조에 quote 필드를 아직 안 둠).
- 칼럼 결과 화면의 섹션별(소제목 단위) 인라인 편집 UI — 지금은 제목 + 평문
  본문(quick fix용) 편집만 유지하고, 세부 편집은 Notion에서 하는 것을 기본
  전제로 함.

## 9. 수용 기준 (요청 원문 14개 기준 매핑)

원문 "수용 기준" 14개 항목을 이 문서의 4절(출력 구조)·5절(Notion 매핑)·2절(UI
흐름)로 구현한다. 검증은 10절 테스트 계획을 따른다.

## 10. 테스트 계획

실제 Anthropic/Notion API 호출은 이 환경에서 불가능하므로, 아래를 정적/모의로
검증한다:

- `node --check`: 변경한 `api/notion.js`, `lib/*.js`.
- `index.html` 인라인 `<script>` 추출 후 `node --check`.
- `git diff --check` (트레일링 공백 등).
- 신규 파서(`parseStructuredColumnJSON`에 대응하는 로직)를 Node 스크립트로 직접
  호출해 아래 케이스를 모의 입력으로 검증:
  - 정상 JSON
  - 코드블록으로 감싼 JSON
  - 앞뒤에 설명 문장이 붙은 JSON
  - 필드 누락(`subtitle`, `sections[].bullets` 없음)
  - 배열 대신 문자열(`tags`가 "a, b, c" 문자열)
  - 완전히 깨진 JSON(파싱 실패) → 한국어 에러 확인
- `api/notion.js`의 블록 생성 로직을 Node 스크립트로 직접 호출(fetch는
  스텁으로 대체)해서 100개 초과 블록일 때 추가 요청이 몇 번 나가는지 확인.
- 짧은 원문/긴 원문/URL 원문/유튜브 자막/정보량 적은 원문/수치·조건 많은 원문/
  법률·금융 원문/교육·입시 원문/스타일 가이드 없음/있음 — 이번 환경에서는 실제
  모델 호출이 안 되므로, 각 케이스에 대해 프롬프트가 생성되는지와 파서가 다양한
  모의 응답(위 케이스들의 조합)을 문제없이 처리하는지까지만 확인.
- 카드뉴스·릴스 생성 회귀: 코드 경로상 `generateCardBaseContent`,
  `generateCardOutline`, `generateReelsScriptFn`을 이번 작업에서 건드리지
  않았음을 diff로 확인.

## 11. 이번 작업에서 하지 않는 것

- Apple 스타일 공개 페이지 편집기 재작성/대규모 리팩터링.
- 관련 API(`api/publish-page.js`, `api/p/[slug].js`)나 `lib/renderColumnPage.js`,
  `lib/notionToHtml.js` 삭제.
- Notion 기존 페이지 업데이트(재업로드 시 새 페이지 대신 갱신) 기능 구현.
- 카드뉴스/릴스 생성 프롬프트·파서 변경.
- 프레임워크 도입이나 `index.html`의 대규모 파일 분리.
