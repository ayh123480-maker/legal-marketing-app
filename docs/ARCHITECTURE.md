# ARCHITECTURE

기존 요약은 `README.md`(폴더 구조)와 `CLAUDE.md`(렌더링 주의사항, 배포)를 참고.
이 문서는 칼럼 재구성 → Notion 업로드 흐름의 데이터 흐름만 보강 설명한다.

## 칼럼 재구성 → Notion 업로드 데이터 흐름

```
state.pipeline.sourceText / sourceUrl (index.html, 클라이언트 상태)
  → generateRewrittenColumn()
      - writingPersonaPrompt(): compliance/safety + 사용자 style guide
      - buildSourceFidelityRules() / buildEditorialQualityRules() /
        buildStructureRules() / buildOutputContract(): 새로 분리된 프롬프트 조각
      - /api/ai (Anthropic 호출, 서버에만 API 키)
      - parseStructuredColumnJSON(raw): JSON 파싱 + 방어 처리
  → state.pipeline.rewrittenColumn
      { title, subtitle, body(평문, 파생값), keyPoints, tags,
        structured: { introduction, sections, conclusion } | null }
  → runNotionUpload()
      - structured가 있으면 payload에 structured 포함
      - /api/notion (Notion API 호출, 서버에만 API 키)
        - structured 있으면 buildStructuredChildren()로 heading/paragraph/
          bullet/callout 매핑, 100개 초과 시 blocks.children.append로 이어붙임
        - structured 없으면(레거시 프로젝트) 기존 평문 문단 분리 로직
  → Notion 페이지 URL 반환 → 사용자가 Notion 앱에서 최종 수정
```

## 레거시 경로 (유지, 신규 개발 대상 아님)

`state.pipeline.notionPageId`가 있을 때만 활성화되는 "노션 내용으로 발행"
(`runPublishFromNotion`)은 Notion 페이지를 다시 읽어와 `/c/:slug` 공개 페이지로
렌더링한다 (`lib/notionToHtml.js` → `sanitizeColumnBody` → `lib/renderColumnPage.js`,
저장은 Vercel KV `pubpage:<slug>`). 이 경로는 UI에서 접어둔 상태로 유지된다.
