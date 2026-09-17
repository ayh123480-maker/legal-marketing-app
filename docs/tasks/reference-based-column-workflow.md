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
