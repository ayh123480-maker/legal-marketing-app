# ROADMAP

## 지금 (2026-09-16)

- [x] 칼럼 생성 출력을 구조화(JSON: title/subtitle/introduction/sections/
      keyPoints/conclusion/tags)해서 Notion에 heading/paragraph/bullet/callout으로
      매핑 — `docs/tasks/column-notion-quality.md`.
- [x] 칼럼 재작성 프롬프트를 원문 충실성/편집 품질/구조/문체/컴플라이언스
      관심사로 분리.
- [x] Notion 업로드 시 100블록 초과로 내용이 조용히 잘리던 문제 수정(추가 요청으로
      분할, 실패 시 사용자에게 알림).
- [x] 칼럼 결과 화면의 기본 CTA를 "Notion 업로드"로 단순화하고, "예쁜 페이지로
      발행"은 레거시 영역으로 접어서 숨김.
- [x] Anthropic/Notion API의 401/403을 그대로 전달하던 것을 502로 통일 — 서버 쪽
      API 키 문제를 "이 앱 로그인 만료"로 오인해서 로그인 화면으로 튕기던 버그 수정.
- [x] (2026-09-17) `sections[].ordered`(절차형 번호 목록) · `sections[].quote`
      (원문 실제 인용구) 필드 추가해서 numbered_list_item/quote 블록 매핑 지원.
- [x] (2026-09-17) AI 응답 포맷을 JSON → 태그 구분자(###)로 변경 — 실제 운영
      환경에서 한국어 문장의 따옴표 때문에 JSON 파싱이 깨지던 버그 수정.
- [x] (2026-09-17) 이미 업로드한 프로젝트는 "노션에 업로드" 대신 "이미 업로드한
      페이지 열기"를 기본으로 보여줘서, 매번 새 페이지가 생기는 데서 오는 혼란을
      완화 (페이지 내용 실제 갱신은 여전히 범위 밖).
- [x] (2026-09-17) 칼럼 재작성을 "레퍼런스 기반 AI 칼럼 제작·수정 도구"로 확장 —
      주요 원문 + 레퍼런스 0~5개(역할·비중) + 브리프(주제/대상/용도/분량 등) →
      초안 생성, 자연어로 "제목만 바꿔줘" 같은 수정 지시 반복 지원, 네이버
      블로그용 복사 포맷 추가. `docs/tasks/reference-based-column-workflow.md`.
- [x] (2026-09-17) 원문 재구성 리포트 추가 — 무엇이 달라졌는지·레퍼런스 반영
      내역(AI 서술) + 원문/레퍼런스와 겹치는 표현 실시간 점검(결정적 n-gram
      대조, AI 자기보고 아님)으로 표절·중복 위험을 바로 확인 가능
      (`docs/tasks/reference-based-column-workflow.md` 15절).
- [x] (2026-09-17) 근거 없는 내용(할루시네이션) 점검을 별도 AI 검증 호출로 추가,
      레퍼런스에 활용 지침(`usageNote`) 필드 추가해 "참고자료"가 아니라 "소재"로
      취급, 비교 화면(큰 모달 — 왼쪽 소스/오른쪽 칼럼/아래 리포트)을 추가
      (`docs/tasks/reference-based-column-workflow.md` 16절).

## 다음 (아직 착수 안 함)

- [ ] 같은 프로젝트를 여러 번 Notion에 업로드할 때, 새 페이지 대신 기존 페이지의
      **내용을 실제로 갱신**하는 옵션 (Notion 기존 블록 안전 교체 방법 조사 필요 —
      `docs/tasks/column-notion-quality.md` 8절).
- [ ] 카드뉴스/릴스 생성 프롬프트도 동일한 "관심사 분리" 원칙으로 정리.
- [ ] 교육·입시 콘텐츠용 분야별 안전 규칙 세트 추가 (현재는 법률·금융만 있음,
      말투 하드코딩은 이미 없앤 상태라 규칙 세트만 추가하면 됨).

## 보류 (핵심 방향에서 제외, 삭제하지 않음)

- Apple 스타일 공개 페이지(`/c/:slug`) 편집기 확장/재작성. 기존 링크·데이터는
  유지, 관련 API(`api/publish-page.js`, `api/p/[slug].js`) 및 렌더러
  (`lib/renderColumnPage.js`, `lib/notionToHtml.js`)도 유지.
- BlockNote/Tiptap 기반 자체 리치 에디터의 추가 기능 확장.
