# ARCHITECTURE

기존 요약은 `README.md`(폴더 구조)와 `CLAUDE.md`(렌더링 주의사항, 배포)를 참고.
이 문서는 칼럼 재구성 → Notion 업로드 흐름의 데이터 흐름만 보강 설명한다.

## 칼럼 재구성 → Notion 업로드 데이터 흐름

```
state.pipeline.sourceText / sourceUrl (주요 원문)
  + state.pipeline.references[] (0~5개, {label,inputMode,sourceText/sourceUrl,role,weight})
  + state.pipeline.brief (topic/audience/purpose/length/mustInclude/avoid/extraRequest, 전부 선택)
  → generateRewrittenColumn()
      - writingPersonaPrompt(): compliance/safety + 사용자 style guide
      - buildSourceFidelityRules() / buildEditorialQualityRules() /
        buildStructureRules() / buildKeyPointsAndTagsRules() /
        buildReferenceBlendingRules() / buildBriefBlock() /
        buildColumnOutputContract(): 프롬프트 조각들 — 레퍼런스/브리프가 비어
        있으면 관련 블록은 프롬프트에서 통째로 생략됨(회귀 방지)
      - resolveActiveReferences(): 텍스트는 그대로, URL/유튜브는 /api/fetch-url·
        /api/youtube-transcript로 각각 원문을 가져와 역할·비중과 함께 정리
      - /api/ai (Anthropic 호출, 서버에만 API 키)
      - parseStructuredColumnResponse(raw): 태그 구분자(###) 파싱 + 방어 처리
        (JSON이 아님 — 한국어 자유 서술문에서 이스케이프가 깨지는 문제 때문에
        2026-09-17에 태그 방식으로 바꿈, `docs/tasks/column-notion-quality.md` 4절)
  → state.pipeline.rewrittenColumn
      { title, subtitle, body(평문, 파생값), keyPoints, tags,
        structured: { introduction, sections, conclusion } | null }
      (sections[]는 heading/paragraphs/bullets/ordered/callout/quote)
  → (선택, 반복 가능) runColumnRevision()
      - state.pipeline.revisionInstruction(자연어 지시) + serializeDraftForRevision()로
        직렬화한 현재 원고를 applyColumnRevision()이 /api/ai에 다시 보내서
        같은 출력 계약으로 전체 원고를 다시 받고 rewrittenColumn을 교체
        (부분 patch 아님 — buildRevisionRules()가 "지시 안 한 부분은 유지"를 지시,
        `docs/tasks/reference-based-column-workflow.md` 7·8절)
  → runNotionUpload()
      - structured가 있으면 payload에 structured 포함
      - /api/notion (Notion API 호출, 서버에만 API 키)
        - structured 있으면 buildStructuredChildren()로 heading/paragraph/
          bullet(또는 ordered면 numbered)/callout/quote 매핑, 100개 초과 시
          blocks.children.append로 이어붙임
        - structured 없으면(레거시 프로젝트) 기존 평문 문단 분리 로직
  → Notion 페이지 URL 반환 → 사용자가 Notion 앱에서 최종 수정
    (또는 formatColumnForBlogCopy()로 네이버 블로그 등에 붙여넣기 좋은 평문 복사)
```

레퍼런스/브리프/수정 지시 로그는 프로젝트 저장(`saveColumnProject`)에 포함하지
않는다 — 생성 시점의 입력 재료일 뿐이라, 결과(`rewrittenColumn`)만 저장한다.

## 레거시 경로 (유지, 신규 개발 대상 아님)

`state.pipeline.notionPageId`가 있을 때만 활성화되는 "노션 내용으로 발행"
(`runPublishFromNotion`)은 Notion 페이지를 다시 읽어와 `/c/:slug` 공개 페이지로
렌더링한다 (`lib/notionToHtml.js` → `sanitizeColumnBody` → `lib/renderColumnPage.js`,
저장은 Vercel KV `pubpage:<slug>`). 이 경로는 UI에서 접어둔 상태로 유지된다.
