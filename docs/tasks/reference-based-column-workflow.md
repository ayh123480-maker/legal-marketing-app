# 작업 명세 · 레퍼런스 기반 AI 칼럼 제작·수정 도구

작성일: 2026-09-17

## 0. 요약

"칼럼 재작성하기"를 원문 하나를 기계적으로 다시 쓰는 도구에서, **주요 원문 +
여러 레퍼런스 + 브리프(대상·용도·분량·필수포인트 등)를 조합해 초안을 만들고,
자연어 지시로 계속 다듬을 수 있는 도구**로 확장한다. 최종 산출물은 지금처럼
Notion 구조화 업로드와 네이버 블로그용 복사를 그대로 지원한다.

## 1. 현재 사용자 흐름

```
원본 입력(텍스트/URL/유튜브 자막) 하나
  → generateRewrittenColumn() — writingPersonaPrompt + 원문충실성/편집품질/
    구조/키포인트·태그 규칙 + 태그 구분자 출력 계약 하나로 프롬프트 조립
  → rewrittenColumn { title, subtitle, body, keyPoints, tags, structured }
  → 화면에서 제목/본문 확인(평문 textarea, quick fix만) → 노션 업로드 또는 복사
```

수정은 본문 textarea를 직접 고치는 것뿐이고(그러면 `structured`가 무효화돼
평문 경로로 폴백), AI에게 "이 부분만 다시 써줘" 같은 자연어 지시를 내릴 방법이
없다. 입력도 원문 하나뿐이라 레퍼런스 자료를 함께 참고시킬 수 없다.

## 2. 변경할 사용자 흐름

```
주요 원문 입력 (기존과 동일: 텍스트/URL/유튜브)
  + 레퍼런스 0~5개 (각각 텍스트/URL/유튜브, 역할, 비중)
  + 브리프(선택): 주제/대상/용도/분량/필수 포함 포인트/피할 표현/추가 요청
  → generateRewrittenColumn() — 위 모든 입력을 조합한 프롬프트로 초안 생성
  → rewrittenColumn (기존과 동일한 모양: title/subtitle/body/keyPoints/tags/structured)
  → 화면에서 확인 → "AI에게 수정 지시하기"에 자연어로 입력
    ("제목만 바꿔줘", "두 번째 섹션만 쉽게 설명해줘", "전체를 더 짧게 줄여줘" 등)
    → applyColumnRevision(instruction) — 현재 원고 + 지시를 함께 프롬프트에
      넣어 같은 태그 형식으로 다시 받고, rewrittenColumn을 교체
  → 노션 업로드(기존과 동일) 또는 "네이버 블로그용 복사"(붙여넣기 친화적 포맷)
```

레퍼런스/브리프를 하나도 안 채우면 기존 흐름과 동일하게 동작해야 한다(하위 호환).

## 3. 상태 데이터 구조

`state.pipeline`에 추가:

```js
references: [],   // Reference[] — 4절 참고, 기본 빈 배열
briefOpen: false,     // "칼럼 브리프" 패널 펼침 여부 (세션 한정, 저장 안 함)
referencesOpen: false, // "레퍼런스" 패널 펼침 여부 (세션 한정, 저장 안 함)
brief: {
  topic: "",        // 최종 글의 주제
  audience: "",     // 글을 읽을 대상
  purpose: "",      // 글의 용도 (블로그 발행용, 강의 자료 등)
  length: "",       // 글의 분량 (자유 텍스트 — 예: "1500자 내외". 비우면 지금처럼 원문 분량에 맞춰 AI가 정함)
  mustInclude: "",  // 반드시 포함할 포인트 (줄바꿈으로 여러 개)
  avoid: "",        // 피해야 할 표현이나 내용 (줄바꿈으로 여러 개)
  extraRequest: "", // 추가 요청 (자유 텍스트)
},
revisionInstruction: "", // "AI에게 수정 지시하기" 입력창 값
revisionHistory: [],     // [{instruction, at}] — 지금까지 내린 수정 지시 로그(사용자에게 보여주기 위함, AI 프롬프트에는 안 씀)
loading: { column:false, reels:false, notion:false, notionPublish:false, revision:false }, // revision 필드 추가
```

`rewrittenColumn`의 모양(title/subtitle/body/keyPoints/tags/structured)은 그대로
유지 — 레퍼런스/브리프는 입력 단계에서만 쓰이고 결과 데이터 구조는 바꾸지 않는다.

## 4. 레퍼런스 데이터 구조

```js
{
  id,              // "ref-" + timestamp + random
  label,           // 사용자가 붙이는 이름 (기본값 "레퍼런스 N")
  inputMode,       // text | url | youtube
  sourceText,      // inputMode === "text"일 때 원문
  sourceUrl,       // inputMode === "url" | "youtube"일 때 링크
  role,            // facts | structure | tone | example | mixed
  weight,          // low | medium | high (5절 참고 — 숫자 %가 아니라 3단계로 단순화)
}
```

`MAX_REFERENCES = 5`로 상수 분리(`index.html` 상단 상수 영역). 레퍼런스는 저장은
안 하고 생성 시점에만 쓰므로(현재 브라우저 세션 한정 입력), 프로젝트 저장에는
포함하지 않는다 — 대신 **생성된 초안에 어떤 레퍼런스가 반영됐는지는 저장하지
않고, 결과(rewrittenColumn)만 저장한다** (11절 참고).

역할(role)별 의미:
- `facts` — 사실·수치·조건을 보강하는 자료. 원문과 마찬가지로 "여기 없는 사실은
  지어내지 마라" 규칙이 그대로 적용됨.
- `structure` — 글의 구성(소제목 순서, 섹션 나누는 방식)을 참고할 자료. 내용
  자체보다 "이런 흐름으로 짜라"는 틀로만 참고.
- `tone` — 말투·문체를 참고할 자료. 사용자의 글쓰기 스타일 가이드(`state.styleGuide`)가
  있으면 그게 항상 우선이고, tone 레퍼런스는 스타일 가이드가 없을 때만 참고.
- `example` — 예시·사례로 인용할 자료. 사실 fabrication 금지 규칙 그대로 적용
  (예시 자료에 있는 사례만 사용, 지어내지 않음).
- `mixed` — 위 구분 없이 자유롭게 참고.

## 5. 레퍼런스 반영 비중 규칙

숫자 퍼센트(%) 합산 검증 같은 복잡한 규칙 대신, **낮음/보통/높음** 3단계로
단순화한다 (사용자 입력 부담과 프롬프트 설계 복잡도를 낮추기 위한 선택 —
14절 "하지 않는 것" 참고). 프롬프트에는 각 레퍼런스마다 "이 레퍼런스는 [역할]
용도로, 반영 비중은 [낮음/보통/높음]이다"라고 명시하고, AI에게 아래 우선순위를
지시한다:

1. **사실 충돌 시**: 주요 원문이 항상 1순위 기준. 레�퍼런스가 주요 원문과
   충돌하는 사실을 담고 있으면, 비중이 "높음"이어도 임의로 하나를 정답으로
   단정하지 말고 둘 다 사실로 다루지 않거나(모호하면 그 부분은 빼거나 완곡하게
   표현) 원문 쪽을 우선한다.
2. **비중 "높음"** 레퍼런스는 실제 본문 분량(문단 수)에 비례해서 많이 반영.
3. **비중 "낮음"** 레퍼런스는 짧게 참고만 하고(예: 한두 문장 인용/보강) 글
   전체를 그 레퍼런스 위주로 재구성하지 않는다.
4. 역할이 `structure`/`tone`인 레퍼런스는 "내용"이 아니라 "형식/말투"만
   참고 대상이라는 점을 프롬프트에 명시해서, 그 레퍼런스의 사실관계가 본문에
   섞여 들어가는 걸 막는다.

## 6. 칼럼 생성 프롬프트 구조

관심사 분리는 기존과 동일하게 유지하고, 레퍼런스/브리프를 위한 조각을 추가한다:

```
persona (writingPersonaPrompt: compliance/safety + 사용자 style guide)
buildSourceFidelityRules(inputMode)         [기존]
buildEditorialQualityRules()                [기존]
buildStructureRules()                       [기존]
buildKeyPointsAndTagsRules()                [기존]
buildReferenceBlendingRules(references)     [신규 — 레퍼런스가 있을 때만 추가]
buildBriefBlock(brief)                      [신규 — 채워진 필드가 있을 때만 추가]
[주요 원문] ...
[레퍼런스 1: 라벨 — 역할: ..., 비중: ...] ...  [신규 — 반복]
buildColumnOutputContract()                 [기존, 변경 없음]
```

레퍼런스나 브리프가 비어 있으면 해당 블록 자체를 프롬프트에서 생략해서(빈
섹션을 안 넣음), 지금까지와 프롬프트가 거의 동일하게 유지되도록 한다(회귀 방지).

## 7. AI 수정 프롬프트 구조

새 함수 `applyColumnRevision(instruction)`:

```
persona
buildEditorialQualityRules()
buildRevisionRules(instruction) [신규 — 8절 "부분 수정 vs 전체 수정" 규칙]
[현재 원고] title/subtitle/introduction/sections.../keyPoints/conclusion/tags를
  사람이 읽기 좋은 평문으로 직렬화한 것 (serializeDraftForRevision — JSON/태그
  아님, AI가 "지금 이 글"을 자연스럽게 읽고 이해하게 하기 위함)
[사용자의 수정 지시] instruction 그대로
buildColumnOutputContract()     [기존과 동일한 출력 계약 — 항상 전체 문서를 다시 냄]
```

**구현하면서 바꾼 점**: 처음엔 주요 원문·레퍼런스를 수정 프롬프트에도 다시
넣으려 했는데(사실 확인용), 실제로 구현해보니 URL/유튜브 레퍼런스를 매 수정
요청마다 다시 가져와야 해서 지연시간과 실패 지점이 늘어나는 데 비해 이득이
작았다(전형적인 수정 지시는 제목/톤/분량 조절이라 새 사실을 끌어올 일이 거의
없음). 그래서 최종 구현은 원본 재조회 없이 "지금 원고에 없는 새 사실을
지어내지 마라"는 규칙(`buildRevisionRules`)만으로 충실성을 유지한다 — 원문을
아예 다른 내용으로 바꾸는 식의 큰 수정 지시는 애초에 "새로 재작성하기"를 다시
쓰는 게 맞다.

응답은 `parseStructuredColumnResponse`로 기존과 동일하게 파싱해서
`rewrittenColumn`을 통째로 교체한다(부분 patch가 아니라 전체 재생성 — 8절 참고).

## 8. 부분 수정과 전체 수정의 차이

**둘 다 같은 메커니즘(AI가 전체 문서를 다시 생성)을 쓰지만, 프롬프트 지시로
범위를 구분한다** — 실제로 구조화 데이터의 일부 섹션만 patch하는 기능은 이번
범위에 넣지 않는다(정확한 대상 식별이 자연어만으로는 신뢰하기 어렵고, 잘못
고르면 엉뚱한 섹션이 통째로 사라질 위험이 있어서 — 14절 참고).

`buildRevisionRules(instruction)`가 프롬프트에 반영하는 규칙:

- 사용자 지시가 "전체", "글 전체", "전부", "다" 같은 표현을 포함하거나
  분량/톤처럼 문서 전체에 적용되는 지시(예: "더 짧게 줄여줘", "말투를 바꿔줘")면
  전체를 그 방향에 맞게 새로 쓴다.
- 그 외(예: "제목만", "두 번째 섹션만", "도입부만", "결론만")는 **지시한
  범위만 그 지시대로 바꾸고, 나머지 모든 섹션·문장은 지금 원고의 표현을 최대한
  그대로 유지**한다(새로 지어내거나 다른 표현으로 바꾸지 않음).
- "특정 문단은 그대로 두고 나머지만 수정해줘" 같은 지시는 사용자가 어떤
  문단인지 지시에서 밝힌 대로 그 문단만 원문 그대로 유지하고 나머지를 지시대로
  고친다.
- 이 규칙은 원문 충실성 규칙과 별개다 — 어떤 경우든 원문/레퍼런스에 없는
  사실을 새로 지어내면 안 된다는 규칙은 수정 시에도 항상 유지된다.

## 9. Notion 블록 매핑

변경 없음. `rewrittenColumn.structured`가 여전히 같은 모양(introduction/sections
[heading,paragraphs,bullets,ordered,callout,quote]/conclusion)이므로 기존
`buildStructuredChildren`(api/notion.js)이 그대로 동작한다. 레퍼런스/브리프
메타데이터는 Notion에 올리지 않는다(범위 밖 — 필요하면 다음 작업으로).

## 10. 네이버 블로그용 복사 규칙

지금은 `(title)\n\n(body)`만 복사한다. 새 함수 `formatColumnForBlogCopy(c)`를
추가해서 다음 형태로 복사한다(마크다운 기호는 네이버 블로그에 그대로 텍스트로
붙기 때문에 쓰지 않고, 빈 줄과 최소한의 기호만 사용):

```
(title)
(subtitle이 있으면 그 아래 한 줄)

(introduction)

(section.heading — 있으면 단독 줄)
(section.paragraphs)
(section.bullets — "• " 접두어, section.ordered면 "1. " 접두어)
(section.quote — "" 로 감싸서 인용 표시)
(section.callout — "💡 " 접두어)

... (섹션 반복)

(conclusion)

(keyPoints가 있으면 "핵심 포인트" 줄 + 목록)
(tags를 "#태그1 #태그2 ..."로 맨 아래)
```

`structured`가 없는(레거시) 프로젝트는 지금처럼 `title + body`만 복사한다
(하위 호환 — `formatColumnForBlogCopy`가 `structured` 유무를 보고 분기).

## 11. 기존 프로젝트 호환 방식

- 저장된 프로젝트(`columnProjects[].rewrittenColumn`)는 지금 모양 그대로라
  레퍼런스/브리프 없이도 정상 로드·업로드·복사된다.
- `references`/`brief`/`revisionInstruction`/`revisionHistory`는 프로젝트
  저장 데이터에 포함하지 않는다 — 생성 당시의 "입력 재료"일 뿐, 결과물이
  아니기 때문(용량 문제도 방지). 프로젝트를 다시 불러오면 레퍼런스/브리프
  입력창은 빈 상태로 초기화되고, 결과(rewrittenColumn)만 복원된다.
- `resetPipeline()`/`loadColumnProject()`/`restoreColumnDraft()` 모두
  references/brief 필드에 기본값을 채워서 예전 형식 상태 객체를 불러와도
  깨지지 않게 한다.
- 카드뉴스/릴스는 이번 작업에서 건드리지 않는다 — `rewrittenColumn.body`가
  여전히 평문 문자열이라 영향 없음.

## 12. 수용 기준

1. 레퍼런스를 0개 추가한 상태에서 칼럼 재작성은 지금과 동일하게 동작한다(회귀 없음).
2. 레퍼런스를 1~5개 추가하고 역할/비중을 지정하면, 그 정보가 프롬프트에
   반영된다(정적 검증 — 실제 모델 호출 없이 프롬프트 문자열에 포함되는지 확인).
3. 레퍼런스 6개 이상은 추가할 수 없다(`MAX_REFERENCES` 상수로 제한).
4. 브리프(주제/대상/용도/분량/필수포인트/피할표현/추가요청)를 채우면 프롬프트에
   반영되고, 비우면 프롬프트에서 생략된다.
5. 초안 생성 후 "AI에게 수정 지시하기"에 자연어 지시를 입력하면 `rewrittenColumn`이
   갱신된다.
6. "제목만 바꿔줘" 같은 부분 수정 지시와 "전체를 더 짧게 줄여줘" 같은 전체 수정
   지시가 프롬프트에서 다르게 처리된다(8절 규칙이 프롬프트 문자열에 반영되는지
   정적으로 확인).
7. 결과는 여전히 Notion 구조화 업로드가 가능하다(기존 `structured` 모양 유지).
8. 네이버 블로그용 복사 버튼이 소제목·목록·인용을 구분해서 복사한다.
9. 기존 저장 프로젝트를 열어도 깨지지 않는다.
10. 실패 시 사용자가 이해할 수 있는 한국어 오류를 보여준다.

## 13. 테스트 계획

- `node --check`로 변경한 모든 파일 문법 검증.
- `index.html` 인라인 스크립트 추출 후 `node --check`.
- `git diff --check`.
- 프롬프트 빌더 함수(`buildReferenceBlendingRules`, `buildBriefBlock`,
  `buildRevisionRules`)를 Node로 직접 호출해서, 레퍼런스/브리프가 있을 때와
  없을 때 각각 프롬프트 문자열에 무엇이 포함/생략되는지 확인.
- `formatColumnForBlogCopy`를 구조화 결과/레거시(structured 없음) 두 케이스로
  직접 호출해서 출력 형태 확인.
- Playwright로 실제 브라우저에서: 로그인 → 레퍼런스 2개 추가(텍스트 모드,
  역할/비중 지정) → 브리프 일부 채움 → 칼럼 생성(모의 Anthropic 응답) →
  결과 확인 → 수정 지시 입력 → 결과 갱신 확인 → 노션 업로드까지 재현.
- 레퍼런스 없이 기존처럼 생성하는 케이스도 같은 방식으로 회귀 확인.
- 카드뉴스/릴스 생성 함수는 건드리지 않았음을 diff로 확인.

## 14. 이번 작업에서 하지 않는 것

- 레퍼런스 비중을 숫자 %(합계 100 검증 등)로 받는 정교한 방식 — 낮음/보통/높음
  3단계로 단순화.
- 구조화 데이터의 특정 섹션만 정밀하게 patch하는 부분 수정 엔진 — 항상 전체
  문서를 다시 생성하되, 프롬프트로 "지시 안 한 부분은 그대로 유지"를 지시하는
  방식으로 대체.
- 수정 히스토리의 되돌리기(undo)/버전 비교 UI — 이번엔 로그(`revisionHistory`)만
  보여주고 되돌리기는 넣지 않음.
- 레퍼런스/브리프 자체를 프로젝트에 영구 저장 — 결과물만 저장(11절).
- Notion 블록에 레퍼런스/브리프 메타데이터를 함께 올리는 기능.
- 카드뉴스·릴스 생성 파이프라인 변경.
- Apple 스타일 공개 페이지 관련 어떤 작업도 하지 않음(계속 보류 상태 유지).

## 15. 원문 재구성 리포트 (2026-09-17 추가 기능)

사용자가 실사용 후 요청: "원본이랑 어떤 내용이 달라졌고, 레퍼런스의 어떤 부분을
보완해서 글을 완성했는지 리포트로 보여달라 — 표절 의혹/중복을 피하고 싶다."

**설계 방향**: AI의 자기보고만으로는 "표현을 다 바꿨다"고 말해놓고 실제로는
안 바꿨을 위험이 있으므로(신뢰할 수 없음), 두 가지를 분리했다.

1. **AI 서술 리포트** (`report.changesSummary`, `report.referenceNotes`) —
   `buildColumnOutputContract({ includeReport: true })`가 최초 생성 프롬프트에만
   `###REPORT_CHANGES###`/`###REPORT_REFERENCES###` 태그를 추가로 요구해서,
   원문 대비 논지·구성·강조점이 어떻게 달라졌는지와 레퍼런스별 반영 내역을
   AI가 직접 설명하게 한다. 수정 지시(`applyColumnRevision`) 응답에는 이 태그를
   요구하지 않고, `parseStructuredColumnResponse(raw, {previousReport})`가 이전
   리포트를 그대로 이어받는다 — 그래서 이 서술은 "최초 생성 시점 기준"이고,
   화면에도 그렇게 안내한다.
2. **겹침 점검(결정적, AI 무관)** (`report.overlaps`) — `findOverlapSpans`가
   공백을 뺀 문자 단위 12-gram 인덱스로 본문과 원문/각 레퍼런스 사이에 20자
   이상 연속으로 겹치는 구간을 코드로 직접 찾는다(형태소 분석기 없이 한국어에도
   바로 적용 가능). AI 응답과 무관하게 항상 재계산되고, 본문 textarea를 직접
   고칠 때마다 실시간으로(전체 `render()` 없이 `#rc-overlap-report`만 patch)
   다시 계산해서, 사용자가 원문을 그대로 붙여넣는 순간 바로 경고가 뜬다.

`state.pipeline.lastGenerationSources`(`{mainSource:{label,text}, references:[{label,text}]}`)에
겹침 점검용 원문 텍스트를 보관한다 — 레퍼런스/브리프와 마찬가지로 프로젝트
저장에는 포함하지 않는다(생성 시점 재료). 저장된 프로젝트를 다시 열면
`lastGenerationSources`가 없으므로, 그 세션에서 본문을 다시 고쳐도 겹침 점검을
새로 계산하지 않고 마지막으로 계산해둔 결과(`rewrittenColumn.report.overlaps`,
이건 저장됨)를 그대로 보여준다 — "겹침 없음"으로 잘못 안심시키지 않기 위함.

**하지 않은 것**: 정밀한 유사도 %(예: 코사인 유사도) 계산이나 외부 표절 검사
API 연동은 하지 않았다 — 이 도구가 최종 표절 판정을 내리는 게 아니라 "여기
다시 풀어써보라"는 1차 신호만 주면 충분하다고 판단했다. Notion 업로드나
블로그용 복사에는 리포트를 포함하지 않는다(작업 중 참고용이지 발행물이 아님).

## 16. 할루시네이션(근거 없는 내용) 점검 + 레퍼런스를 "소재"로 취급 + 비교 화면 (2026-09-17 추가)

사용자 피드백 3가지에 대응함.

### 16.1 근거 없는 내용(할루시네이션) 점검

15절의 겹침 점검은 "베꼈는지"만 잡아내고, "원문에 없는 내용을 지어냈는지"는
잡지 못한다(패러프레이즈된 지어낸 내용은 글자 그대로 안 겹치므로). 그래서
`verifyColumnGrounding(rewrittenColumn, lastGenerationSources)`를 별도
함수로 추가했다 — **같은 호출 안에서 AI가 자기 글을 자기가 검토하게 하지
않고, 완전히 독립된 새 API 호출로 "이 글을 검토하는 입장"에서 다시 확인**시킨다
(자기 자신이 방금 쓴 글을 스스로 문제없다고 우길 위험을 줄이기 위함 — 다만
이것도 결국 AI 판단이라 100% 정확함을 보장하지 않고, 화면에 "AI 검토(참고용)"라고
분명히 표시한다).

- 생성(`runColumnGeneration`)과 수정 지시(`runColumnRevision`) 둘 다에서, 성공
  직후 `runGroundingCheck()`를 **기다리지 않고(non-blocking)** 호출한다 — 생성/수정
  자체를 늦추지 않고, 완료되면 알아서 `report.groundingStatus`("checking"→"done")와
  `report.groundingIssues`를 채우고 다시 그린다.
- 호출 시점에 `const c = p.rewrittenColumn`으로 원고 객체를 붙잡아두므로, 검토가
  끝나기 전에 사용자가 또 수정 지시를 내려서 `p.rewrittenColumn`이 새 객체로
  바뀌어도 오래된 결과가 새 원고에 잘못 덮어써지지 않는다.
- 출력 형식은 다른 것들과 같은 태그 구분자(`###UNGROUNDED_START###...###UNGROUNDED_END###`)를
  쓰고, 목록 기호(`- `)만 벗겨내고 숫자로 시작하는 내용(예: "2024년...")은 건드리지
  않도록 파싱했다(`coerceStringArray`의 번호매김 제거용 정규식을 그대로 썼다가
  "2024"가 잘려나가는 버그가 있어서 별도 처리).

### 16.2 레퍼런스를 "참고자료"가 아니라 "소재"로

사용자가 "레퍼런스가 단순 참고용이라기보다 글을 만드는 재료"라고 명확히 함.
`buildReferenceBlendingRules`의 문구를 "곁다리 참고자료가 아니라... 실제
소재"로 바꾸고, 비중 "높음"의 의미를 "짧게 참고"에서 "구체적인 사실·수치·사례를
실질적인 분량으로 가져와서 씀"으로 강화했다. 다만 숫자 %(합계 100 검증)로
정밀하게 받는 방식은 여전히 안 함(14절과 동일한 이유 — 복잡도 대비 이득이 작음).
대신 레퍼런스마다 **`usageNote`(활용 지침, 자유 텍스트)** 필드를 추가해서
"이 통계만 인용해줘", "이 사례를 예시로 그대로 써줘" 같은 구체적 지시를 낼 수
있게 했다 — 숫자 조정보다 사용자 의도를 더 정확히 전달하는 방법이라고 판단.
`usageNote`가 있으면 역할·비중보다 먼저 그 지시를 따르도록 프롬프트에 명시.
(`state.pipeline.lastGenerationSources.references[]`에도 role/weight/usageNote를
함께 스냅샷 떠서, 생성 이후 `p.references`가 바뀌거나 비워져도 비교 화면에서
안전하게 보여줄 수 있게 했다.)

### 16.3 비교 화면(큰 모달)

"재작성된 칼럼을 클릭하면 큰 화면이 뜨고, 오른쪽엔 재작성된 칼럼, 왼쪽엔 소스
자료, 맨 밑으로 내리면 무엇이 달라졌고 같은지 리포트가 나오면 좋겠다"는 요청을
그대로 구현.

- `renderColumnEditorFields(p, c, {includeReport})`로 제목/본문/태그/수정지시/
  업로드 버튼 등 "편집 내용"을 공통 함수로 추출해서, 작은 카드 뷰
  (`renderRewrittenColumn`)와 비교 화면(`renderColumnCompareView`)이 같은
  마크업·id를 공유한다. 두 뷰는 `state.pipeline.compareViewOpen` 값에 따라
  `renderColumns()`가 **항상 배타적으로** 하나만 그리므로(`rc-title-input`
  등 id가 동시에 두 곳에 존재하지 않음) id 재사용에 문제가 없다.
- 왼쪽 패널은 `p.lastGenerationSources`(주요 원문 + 레퍼런스 스냅샷, 역할·비중·
  활용지침 포함)를 보여준다. 이 세션에서 생성한 기록이 없으면(예: 저장된
  프로젝트를 다시 열었거나 새로고침한 경우) 안내 문구만 표시.
- 오른쪽 패널은 `renderColumnEditorFields(p, c, {includeReport:false})`로
  리포트는 빼고 편집 UI만 넣고, 리포트(`renderRewriteReport(c)`)는 좌우
  패널 아래에 전체 너비로 한 번만 그려서 "맨 밑으로 스크롤하면 리포트가
  나온다"는 요청과 정확히 맞춘다.
- **스크롤 보존**: 이 앱은 `render()`가 `#app.innerHTML`을 통째로 다시 그리는
  구조라, 새 스크롤 가능 영역을 추가하면 CLAUDE.md에 이미 기록된 것과 같은
  버그(다시 그릴 때마다 스크롤이 맨 위로 튕김)가 재발한다. 그래서 `render()`의
  기존 `card-editor-panel` 스크롤 보존 로직을 `SCROLLABLE_PANEL_IDS` 배열로
  일반화하고 `compare-view-box`/`compare-sources-panel`/`compare-column-panel`을
  추가했다 — 앞으로 스크롤 영역을 더 추가할 때도 이 배열에 id만 추가하면 됨.

**테스트**: Playwright로 레퍼런스 활용지침이 프롬프트에 실제로 들어가는지,
근거 검토가 "checking→done"으로 넘어가고 지어낸 내용(모의 응답)을 정확히
잡아내는지(선행 숫자가 안 잘리는 것 포함), 비교 화면이 열리고 소스/칼럼/리포트가
올바른 위치에 나오는지, 소스 패널을 스크롤한 뒤 `render()`를 다시 호출해도
스크롤이 유지되는지까지 실제 브라우저로 확인함.
