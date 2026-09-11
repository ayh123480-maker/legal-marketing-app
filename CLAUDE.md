# legal-marketing-app

법률 마케팅(개인회생·형사사건) 콘텐츠 파이프라인 도구. Vercel에 배포되는 단일 HTML 앱(`index.html`)이며, `api/`는 Vercel 서버리스 함수(로그인, AI 호출, 스토리지 등)를 담당한다.

**카드뉴스 슬라이드의 색상·타이포그래피·레이아웃 규칙은 [DESIGN.md](DESIGN.md)에 문서화되어 있음.** `buildCardMarkup()` 등 카드 디자인 관련 코드를 건드릴 때는 먼저 이 문서를 읽고, 수정 후에는 문서도 같이 업데이트할 것 — 코드와 문서가 어긋나지 않게 유지하는 게 목적.

## 렌더링 아키텍처 주의사항

`render()`는 `#app.innerHTML`을 매번 통째로 다시 그리는 방식(가상 DOM 없음)이라, `<input type="range">`처럼 "input" 이벤트가 짧은 간격으로 계속 발생하는 컨트롤에서 매번 `render()`를 호출하면 스크롤 위치가 초기화되는 버그가 있었다(2026-09-10 수정). `render()` 안에서 문서 스크롤과 `#card-editor-panel`(카드 편집 모달의 내부 스크롤 영역) 스크롤을 저장·복원하도록 고쳤음 — **새로운 스크롤 가능 영역(예: 새 모달, 새 패널)을 추가하면 그 영역의 스크롤 위치도 render() 시작/끝에서 저장·복원해줘야 같은 버그가 재발하지 않는다.**

## 배포 관련 standing instruction

**이 프로젝트의 코드를 수정하면, 사용자가 매번 요청하지 않아도 다음을 자동으로 수행할 것:**
1. `git add -A && git commit -m "..." && git push` — GitHub 저장소(`https://github.com/ayh123480-maker/legal-marketing-app`, private)에 반영

2026-09-10부터 Vercel 프로젝트(`legal-marketing-app`)가 이 GitHub 저장소의 `main` 브랜치에 연결되어 있어서(`vercel git connect`), **`git push`만 하면 Vercel이 자동으로 프로덕션에 배포한다.** 따로 `vercel --prod`를 수동으로 돌릴 필요 없음 — push 후 몇 분 안에 https://legal-marketing-app.vercel.app 에 반영됨. (혹시 자동 배포가 안 되는 것 같으면 `vercel --prod --yes --cwd "D:\marketing\legal-marketing-app-v2"`로 수동 배포해도 안전함.)

사용자가 2026-09-09에 "앞으로 수정할 때마다 다 반영해줘~"라고 명시적으로 요청해서, 매번 확인받지 않고 커밋/푸시(및 필요시 배포)를 진행해도 되는 사전 승인 상태다. (단, `.gitignore`에 걸린 `.env.local`/`.vercel` 등 비밀 정보는 절대 커밋하지 말 것 — 이미 제외되어 있음)

## ⚠️ 이 저장소는 다른 세션에서도 동시에 작업될 수 있음

2026-09-11에 `git push`하려다가 origin이 11 커밋 앞서있는 걸 발견함 — 2026-09-10 저녁(20:25~23:52)에 **다른 Claude Code 세션**이 같은 git 계정(`ayh123480`)으로 노션 업로드 연동, 콘텐츠 라이브러리 대시보드, 모바일 반응형 레이아웃, 광고 규정 위반 표현 자동 감지, 복사 버튼 등 상당한 기능을 추가하고 푸시해놨었음. 다행히 자동 병합(`git pull --no-rebase`)이 충돌 없이 됐지만, 항상 그럴 거라는 보장은 없음. **그래서 작업을 시작하기 전에 항상 `git pull` 먼저 하고, 커밋 전에도 `git status`/`git log`로 origin이 앞서있는지 확인할 것.** 병합 후에는 반드시 문법 검사(`node --check`로 `<script>` 내용 추출해서 확인)와 중복 함수 선언 여부를 확인하고 나서 푸시할 것.

## 작업 디렉터리 이력

- 원래 사용자가 다운로드한 zip을 압축 해제해서 작업했던 위치: `C:\Users\ubub5\Downloads\legal-marketing-app (20)\legal-marketing-app` (임시 작업본, 지금은 안 씀)
- 사용자의 기존 로컬 작업 폴더: `D:\marketing\legal-marketing-app` (구버전, Vercel/env 연결은 되어있지만 오늘 작업한 카드뉴스 분리·차트 기능 반영 안 됨 — 건드리지 않기로 함)
- **현재 진짜 작업 위치(이 폴더)**: `D:\marketing\legal-marketing-app-v2` — 여기가 최신 코드 + git + Vercel 링크 전부 갖춘 곳
