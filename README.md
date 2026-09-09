# 법률 마케팅 콘텐츠 도구 (개인회생 · 형사사건)

원본 칼럼 → 재작성 칼럼 → 카드뉴스 이미지 → 릴스 대본까지 자동으로 만들어주는 팀용 웹 도구입니다.
서버 경험이 없어도 따라할 수 있도록, **Vercel**에 배포하는 방법을 아래에 순서대로 적어뒀어요.

---

## 이 도구가 필요로 하는 것 3가지

1. **Anthropic API 키** — 이미 있다고 하셨으니 준비 완료 (`https://console.anthropic.com`)
2. **Vercel 계정** — 무료로 가입 가능 (`https://vercel.com`)
3. **Node.js** — 내 컴퓨터에 설치 (`https://nodejs.org`, LTS 버전 아무거나)

---

## 1단계 · 내 컴퓨터에 도구 설치

터미널(맥은 "터미널" 앱, 윈도우는 "명령 프롬프트" 또는 "PowerShell")을 열고 아래를 순서대로 입력하세요.

```bash
npm install -g vercel
```

이 프로젝트 폴더로 이동한 뒤(예: 압축을 푼 폴더),

```bash
cd legal-marketing-app
npm install
```

---

## 2단계 · Vercel에 로그인 & 배포

```bash
vercel login
```
→ 이메일 입력 후, 메일함에서 온 링크를 클릭하면 로그인됩니다.

```bash
vercel
```
→ 여러 질문이 뜨는데 전부 기본값(Enter)으로 넘어가도 됩니다. 마지막에 배포 주소(`https://xxxx.vercel.app`)가 뜨면 성공이에요. (아직 로그인 기능이 작동하려면 3단계가 더 필요합니다.)

---

## 3단계 · 저장소(KV) 연결

1. `https://vercel.com/dashboard` 접속 → 방금 만든 프로젝트 클릭
2. 상단 메뉴에서 **Storage** 탭 클릭
3. **Create Database** → **KV** 선택 → 이름 아무거나 입력 → 생성
4. 만들어진 KV를 방금 그 프로젝트에 **Connect(연결)** — 이 과정에서 `KV_REST_API_URL`, `KV_REST_API_TOKEN` 환경변수가 프로젝트에 자동으로 추가됩니다.

---

## 4단계 · 환경변수(비밀값) 설정

같은 프로젝트 화면에서 **Settings → Environment Variables**로 이동해서 아래 3개를 추가하세요.

| 이름 | 값 | 설명 |
|---|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-...` | 갖고 계신 Anthropic API 키 |
| `APP_PASSWORD` | 원하는 비밀번호 | 팀원들이 로그인할 때 쓸 공유 비밀번호 |
| `SESSION_SECRET` | 무작위 긴 문자열 | 아래 명령으로 생성 |

`SESSION_SECRET`은 터미널에서 이렇게 만들면 됩니다:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
나온 값을 그대로 복사해서 넣으면 돼요. (`.env.example` 파일에 같은 설명이 있어요.)

환경변수를 추가한 뒤에는 **재배포**를 한 번 해줘야 반영됩니다.
```bash
vercel --prod
```

---

## 5단계 · 접속해서 확인

배포 주소(`https://xxxx.vercel.app`)로 접속하면 로그인 화면이 나와요. 3단계에서 설정한 `APP_PASSWORD`를 입력하면 도구가 열립니다.

팀원들에게는 이 주소 + 비밀번호만 공유하면 됩니다. (개별 계정 없이 모두 같은 비밀번호로 로그인하는 구조예요.)

---

## 이후에 코드를 다시 수정하고 싶다면

파일을 고친 뒤, 프로젝트 폴더에서 다시 실행하면 됩니다.
```bash
vercel --prod
```

GitHub 저장소와 연결해두면(Vercel 대시보드 → Settings → Git) 코드를 GitHub에 올릴 때마다 자동으로 재배포되도록 만들 수도 있어요. (선택 사항)

---

## 알아두시면 좋은 점

- **비용**: 매번 "칼럼 재작성 / 카드뉴스 / 릴스 대본"을 만들 때마다 Anthropic API 사용량이 청구돼요. Anthropic 콘솔(`https://console.anthropic.com`)에서 사용량과 한도를 확인·설정할 수 있습니다.
- **보안**: `APP_PASSWORD`와 `SESSION_SECRET`은 절대 GitHub 등 공개된 곳에 올리지 마세요. `.env` 파일은 `.gitignore`에 이미 포함돼 있어요.
- **카드뉴스 이미지 다운로드**는 브라우저에서 `html2canvas`/`JSZip`을 CDN으로 불러와 동작해요. 사내망 방화벽이 `cdnjs.cloudflare.com`을 막고 있다면 카드뉴스 다운로드만 안 될 수 있어요.
- **광고 규정**: 이 도구가 생성하는 문구는 초안일 뿐이에요. 실제 발행 전에는 반드시 소속 지방변호사회의 변호사 광고 심사 절차를 확인하세요.

---

## 폴더 구조

```
legal-marketing-app/
  api/
    login.js      로그인 (비밀번호 확인 → 쿠키 발급)
    logout.js     로그아웃
    session.js    로그인 상태 확인
    storage.js    데이터 저장/조회 (Vercel KV)
    ai.js         Anthropic API 호출 (API 키는 여기에만 존재)
    fetch-url.js  칼럼 원문 URL에서 본문 텍스트 추출
    youtube-transcript.js  유튜브 영상 자막(캡션) 추출
  lib/
    auth.js       쿠키 서명/검증 로직
    parseBody.js  요청 바디 파싱 유틸
  index.html      메인 앱 (대시보드 전체)
  login.html      로그인 화면
  package.json
  .env.example
```
