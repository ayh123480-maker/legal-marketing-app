# legal-marketing-app

법률 마케팅(개인회생·형사사건) 콘텐츠 파이프라인 도구. Vercel에 배포되는 단일 HTML 앱(`index.html`)이며, `api/`는 Vercel 서버리스 함수(로그인, AI 호출, 스토리지 등)를 담당한다.

## 배포 관련 standing instruction

**이 프로젝트의 코드를 수정하면, 사용자가 매번 요청하지 않아도 다음을 자동으로 수행할 것:**
1. `git add -A && git commit -m "..." && git push` — GitHub 저장소(`https://github.com/ayh123480-maker/legal-marketing-app`, private)에 반영
2. `vercel --prod --yes --cwd "D:\marketing\legal-marketing-app-v2"` — 기존 Vercel 프로젝트(`legal-marketing-app`, https://legal-marketing-app.vercel.app)에 배포

사용자가 2026-09-09에 "앞으로 수정할 때마다 다 반영해줘~"라고 명시적으로 요청해서, 매번 확인받지 않고 커밋/푸시/배포를 진행해도 되는 사전 승인 상태다. (단, `.gitignore`에 걸린 `.env.local`/`.vercel` 등 비밀 정보는 절대 커밋하지 말 것 — 이미 제외되어 있음)

## 작업 디렉터리 이력

- 원래 사용자가 다운로드한 zip을 압축 해제해서 작업했던 위치: `C:\Users\ubub5\Downloads\legal-marketing-app (20)\legal-marketing-app` (임시 작업본, 지금은 안 씀)
- 사용자의 기존 로컬 작업 폴더: `D:\marketing\legal-marketing-app` (구버전, Vercel/env 연결은 되어있지만 오늘 작업한 카드뉴스 분리·차트 기능 반영 안 됨 — 건드리지 않기로 함)
- **현재 진짜 작업 위치(이 폴더)**: `D:\marketing\legal-marketing-app-v2` — 여기가 최신 코드 + git + Vercel 링크 전부 갖춘 곳
