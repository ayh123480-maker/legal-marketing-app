/**
 * 재작성된 칼럼을 "완성된 칼럼처럼 보이는" 공개 웹페이지(HTML)로 렌더링한다.
 * api/p/[slug].js가 이 함수를 호출해서 그대로 브라우저에 내려준다.
 *
 * 애플(Apple) 뉴스룸/서포트 아티클 느낌의 디자인 언어(연회색 배경, #1d1d1f 잉크,
 * #0071e3 블루 액센트, 큼직한 라운드 카드, 넉넉한 여백)를 재사용하는 고정된
 * 비주얼 아이덴티티 — 칼럼마다 디자인이 바뀌면 브랜드 일관성이 없어지므로 의도적으로 고정.
 *
 * 페이지 안에 "편집" 기능이 내장돼 있다: 페이지 로드시 /api/session으로 로그인
 * 여부(=이 툴 사용자 본인인지)를 확인해서, 로그인된 상태로 이 링크에 들어오면
 * 우측 하단에 편집 버튼이 나타난다. 별도 비밀번호 입력 없이도 브라우저가 이미
 * 갖고 있는 세션 쿠키(HttpOnly)가 같은 도메인 요청에 자동으로 실려가는 걸 이용한 것.
 *
 * ⚠️ 2026-09-16: 본문 편집기(직접 만든 contenteditable → Tiptap → BlockNote로
 * 두 번 갈아엎었었음, CLAUDE.md/git log 참고)를 완전히 걷어냈다. 브라우저에서
 * CDN으로 React/에디터 라이브러리를 불러오는 구조 자체가 계속 문제(중복 모듈,
 * CSS 누락, 위치 계산 애니메이션 충돌 등)를 일으켜서, "본문은 노션 앱에서 직접
 * 쓰고 우리 서버는 그 결과만 읽어와서 예쁘게 렌더링한다"는 방식(lib/notionToHtml.js
 * + api/notion.js의 publishFromNotion)으로 바꿨다 — 이러면 브라우저 쪽엔 에디터가
 * 아예 없어서 저 문제들이 구조적으로 발생할 수 없다.
 * 그래서 이 페이지의 "편집" 모달은 본문을 직접 고치는 기능이 없다 — 노션
 * 페이지로 바로 이동하는 링크와, 노션의 최신 내용을 다시 읽어와 발행하는
 * 버튼, 그리고 이 앱에서 계속 직접 관리하는 핵심 포인트·태그 입력만 있다.
 * (노션 연동 없이 옛날 방식으로 발행된 페이지는 이 모달에서 본문을 고칠
 * 방법이 없다 — 마케팅 툴 앱에서 다시 재작성해서 발행하거나, 노션에
 * 업로드한 뒤 "노션 내용으로 발행"을 쓰면 된다.)
 *
 * record.bodyFormat에 따라 열람 화면 본문 렌더링이 갈린다:
 *   - "blocknote-json": 예전 BlockNote 에디터가 저장한 레거시 레코드. 순수
 *     텍스트만 서버에서 먼저 깔아두고, /richtext/blocknote-view.js가 로드되면
 *     실제 서식이 있는 HTML로 바꿔치기한다(더 이상 새로 만들어지진 않지만,
 *     기존 레코드가 깨지지 않게 읽기 전용으로는 계속 지원).
 *   - "html": lib/notionToHtml.js가 노션 페이지를 변환한 것(또는 그 이전
 *     Tiptap 에디터가 저장한 레거시 HTML) — sanitizeColumnBody로 정제해서 그대로 씀.
 *   - 그 외(레거시 평문): formatBody()로 문단을 나눠 렌더링한다.
 */

const { sanitizeColumnBody } = require("./sanitizeColumnBody");
const { plainTextFromBlocks } = require("./blocknoteBlocks");

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* 안전하게 <script> 안에 JSON을 심기 위한 이스케이프 (</script> 조기 종료 방지) */
function jsonForScript(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/* 본문 텍스트를 문단 단위로 나눠 HTML로 바꾼다.
   - "· "/"- "/"* "로 시작하는 줄이 이어지면 특약·조항 인용처럼 카드로 렌더링
   - 혹시 마크다운 표(| ... |)가 섞여 들어와도 안전하게 콜론 목록으로 풀어서 보여준다 */
function formatBody(raw) {
  const blocks = String(raw || "")
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  return blocks
    .map((block) => {
      const lines = block.split(/\n/).map((l) => l.trim()).filter(Boolean);
      if (!lines.length) return "";

      const isBulletBlock = lines.every((l) => /^[·\-*]\s+/.test(l));
      if (isBulletBlock) {
        const items = lines.map((l) => l.replace(/^[·\-*]\s+/, ""));
        return `<div class="clause">${items.map((it) => `<p>${escapeHtml(it)}</p>`).join("")}</div>`;
      }

      const isTableish = lines.some((l) => l.includes("|"));
      if (isTableish) {
        const items = lines
          .filter((l) => !/^[\s|:-]+$/.test(l))
          .map((l) => l.split("|").map((c) => c.trim()).filter(Boolean).join(" · "))
          .filter(Boolean);
        if (items.length) {
          return `<div class="clause">${items.map((it) => `<p>${escapeHtml(it)}</p>`).join("")}</div>`;
        }
      }

      return `<p>${escapeHtml(lines.join(" "))}</p>`;
    })
    .join("\n");
}

const SHARED_HEAD = `
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
<style>
  :root{
    --bg:#f5f5f7; --surface:#ffffff; --surface-alt:#f5f5f7;
    --ink:#1d1d1f; --ink-soft:#6e6e73; --ink-faint:#86868b;
    --accent:#0071e3; --accent-ink:#ffffff; --divider:#d2d2d7;
    --shadow:0 2px 24px rgba(0,0,0,.06);
    --font-display:-apple-system,BlinkMacSystemFont,"SF Pro Display","Inter","Apple SD Gothic Neo","Malgun Gothic",sans-serif;
    --font-text:-apple-system,BlinkMacSystemFont,"SF Pro Text","Inter","Apple SD Gothic Neo","Malgun Gothic",sans-serif;
  }
  @media (prefers-color-scheme:dark){
    :root:not([data-theme="light"]){
      --bg:#000000; --surface:#1c1c1e; --surface-alt:#1c1c1e;
      --ink:#f5f5f7; --ink-soft:#a1a1a6; --ink-faint:#86868b;
      --accent:#2997ff; --accent-ink:#ffffff; --divider:#38383c; --shadow:none;
    }
  }
  :root[data-theme="dark"]{
    --bg:#000000; --surface:#1c1c1e; --surface-alt:#1c1c1e;
    --ink:#f5f5f7; --ink-soft:#a1a1a6; --ink-faint:#86868b;
    --accent:#2997ff; --accent-ink:#ffffff; --divider:#38383c; --shadow:none;
  }
  *{ box-sizing:border-box; }
  html,body{ margin:0; }
  [hidden]{ display:none !important; }
  body{
    background:var(--bg); color:var(--ink);
    font-family:var(--font-text);
    -webkit-font-smoothing:antialiased;
  }
  @media (prefers-reduced-motion:no-preference){ html{ scroll-behavior:smooth; } }

  #progress-track{ position:fixed; top:0; left:0; right:0; height:3px; z-index:50; background:transparent; }
  #progress-bar{ height:100%; width:0%; background:var(--accent); }

  .page{ max-width:692px; margin:0 auto; padding:64px 24px 100px; }

  .eyebrow-row{
    display:flex; align-items:center; gap:8px; flex-wrap:wrap;
    font-size:15px; color:var(--ink-faint); margin-bottom:14px;
  }
  .eyebrow-tag{ color:var(--accent); font-weight:600; }
  .dot{ width:3px; height:3px; border-radius:50%; background:var(--ink-faint); }
  h1{
    font-family:var(--font-display); font-weight:800;
    font-size:clamp(1.9rem, 5.4vw, 3.1rem); line-height:1.1; margin:0 0 36px;
    text-wrap:balance; letter-spacing:-.022em; color:var(--ink);
  }

  .checklist{
    margin:0 0 40px; background:var(--surface); border-radius:22px;
    padding:28px 28px 26px; box-shadow:var(--shadow);
  }
  .checklist-label{
    font-size:13px; font-weight:600; letter-spacing:.02em;
    color:var(--ink-faint); margin:0 0 18px; text-transform:uppercase;
  }
  .checklist ul{ list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:20px; }
  .checklist li{ display:flex; gap:14px; align-items:flex-start; }
  .check-mark{
    flex:0 0 auto; width:22px; height:22px; margin-top:1px; border-radius:50%;
    background:var(--accent); display:flex; align-items:center; justify-content:center;
  }
  .check-mark svg{ width:12px; height:12px; }
  .check-mark path{ stroke:var(--accent-ink); }
  .checklist p{ margin:0; font-size:16px; line-height:1.6; color:var(--ink); }

  /* article > div:not(.callout)도 같이 잡아두는 이유: 레거시(평문) 레코드를
     formatBody()로 렌더링할 때 예전 에디터가 남긴 <div> 문단이 섞여 있을 수
     있어서, 태그와 무관하게 본문 문단은 항상 같은 크기로 보이게 함 */
  article p, article > div:not(.callout){
    font-size:19px; line-height:1.63; margin:0 0 24px; color:var(--ink); font-weight:400;
  }
  /* 제목1(h2)=대제목, 제목2(h3)=중제목, 제목3(h4)=소제목 — 크기뿐 아니라 굵기·자간도
     단계마다 달라지게 해서 크기만으론 구분 안 되는 문제(볼드 정도 차이도 원했음)를 해결.
     새 리치 에디터(Tiptap)도 제목1~3을 h2~h4로 저장해서 그대로 같은 스타일을 탄다. */
  article h2{
    font-family:var(--font-display); font-weight:800; font-size:1.85rem; line-height:1.25;
    letter-spacing:-.02em; color:var(--ink); margin:10px 0 18px;
  }
  article h3{
    font-family:var(--font-display); font-weight:700; font-size:1.35rem; line-height:1.35;
    letter-spacing:-.01em; color:var(--ink); margin:8px 0 16px;
  }
  article h4{
    font-family:var(--font-display); font-weight:600; font-size:1.08rem; line-height:1.45;
    color:var(--ink); margin:8px 0 12px;
  }
  article img{
    max-width:100%; height:auto; display:block; border-radius:16px; margin:8px 0 24px;
  }
  /* display:flex는 새 에디터(Tiptap)의 콜아웃(이모지 span + 내용 div)을 나란히
     보여주기 위함 — 자식이 하나뿐인 레거시 콜아웃(평문 텍스트만 있는 것)도
     레이아웃상 문제없이 그대로 보인다 */
  .callout{
    display:flex; gap:12px; align-items:flex-start;
    margin:8px 0 28px; padding:20px 22px; background:var(--surface-alt);
    border-left:3px solid var(--accent); border-radius:14px;
    font-size:16px; line-height:1.7; color:var(--ink);
  }
  .callout-emoji{ flex:0 0 auto; font-size:1.1em; line-height:1.4; }
  .callout-content{ flex:1 1 auto; min-width:0; }
  .callout-content p{ margin:0; }

  /* 글자 크기 수동 조절(선택한 텍스트에 적용) */
  /* em/inherit 대신 절대 단위(px)를 씀 — em/inherit는 부모(중첩된 이전 span)의
     크기를 기준으로 상대 계산되기 때문에, 크게 했다가 "보통"으로 되돌려도 실제로는
     이전에 감싸둔 큰 span 안에 다시 얹히는 구조라 계산상 완전히 안 돌아오고(줄
     간격도 큰 폰트 기준 그대로 남는) 버그가 있었음. px는 조상이 뭘 하든 항상
     같은 절대 크기라 몇 겹을 감싸도 항상 정확히 이 값으로 고정된다. */
  .fs-sm{ font-size:14px !important; }
  .fs-lg{ font-size:24px !important; }
  .fs-xl{ font-size:30px !important; }
  .fs-reset{ font-size:19px !important; }

  /* 글자색 — 화이트리스트 색상만 허용(임의 hex/style은 안 받음) */
  .tc-red{ color:#e5484d !important; }
  .tc-orange{ color:#c2660b !important; }
  .tc-yellow{ color:#9a6b00 !important; }
  .tc-green{ color:#18794e !important; }
  .tc-blue{ color:#0071e3 !important; }
  .tc-purple{ color:#8145b5 !important; }
  .tc-gray{ color:#6e6e73 !important; }
  .tc-reset{ color:inherit !important; }

  /* 형광펜(하이라이트) */
  .hl-yellow{ background:#fdf1a8; }
  .hl-green{ background:#bdf0d1; }
  .hl-blue{ background:#cfe6fd; }
  .hl-pink{ background:#fbd6e0; }
  .hl-gray{ background:#e2e2e6; }
  [class^="hl-"]{ border-radius:3px; padding:0 2px; color:#1d1d1f; }
  .hl-reset{ background:none !important; padding:0 !important; color:inherit !important; }
  @media (prefers-color-scheme:dark){
    :root:not([data-theme="light"]) .hl-yellow{ background:#7a6215; }
    :root:not([data-theme="light"]) .hl-green{ background:#154d35; }
    :root:not([data-theme="light"]) .hl-blue{ background:#173a63; }
    :root:not([data-theme="light"]) .hl-pink{ background:#5c2536; }
    :root:not([data-theme="light"]) .hl-gray{ background:#3a3a3d; }
    :root:not([data-theme="light"]) [class^="hl-"]{ color:#f5f5f7; }
  }
  :root[data-theme="dark"] .hl-yellow{ background:#7a6215; }
  :root[data-theme="dark"] .hl-green{ background:#154d35; }
  :root[data-theme="dark"] .hl-blue{ background:#173a63; }
  :root[data-theme="dark"] .hl-pink{ background:#5c2536; }
  :root[data-theme="dark"] .hl-gray{ background:#3a3a3d; }
  :root[data-theme="dark"] [class^="hl-"]{ color:#f5f5f7; }

  /* 새 리치 에디터(Tiptap)가 만드는 요소들 — 서식 색상은 인라인 style로 이미
     오므로(sanitizeColumnBody가 hex 색상만 통과시킴) 여기선 레이아웃만 잡음 */
  article mark{ border-radius:3px; padding:0 2px; }
  article code{
    font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
    font-size:.9em; background:var(--surface-alt); border-radius:4px; padding:.15em .4em;
  }
  article pre{
    font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
    font-size:.86em; line-height:1.6; background:var(--surface-alt);
    border-radius:10px; padding:14px 16px; overflow-x:auto; margin:8px 0 28px;
  }
  article pre code{ background:none; padding:0; }
  article hr{ border:none; border-top:1px solid var(--divider); margin:32px 0; }

  article ul[data-type="taskList"]{ list-style:none; padding-left:.2em; }
  article ul[data-type="taskList"] li{ display:flex; align-items:flex-start; gap:8px; margin:6px 0; }
  article ul[data-type="taskList"] li > label{ flex:0 0 auto; margin-top:.3em; }
  article ul[data-type="taskList"] li > div{ flex:1 1 auto; }
  article ul[data-type="taskList"] li > div p{ margin:0; }
  article ul[data-type="taskList"] input[type="checkbox"]{ width:15px; height:15px; }
  article ul[data-type="taskList"] li[data-checked="true"] > div{ color:var(--ink-faint); text-decoration:line-through; }

  /* 열람 페이지에서도 토글은 눌러서 여닫을 수 있어야 해서(실제 노션 공개 페이지와
     동일하게) 기본은 접힌 상태로 시작하고, 아래 작은 스크립트가 클릭을 처리한다 */
  article div[data-type="toggle"]{ position:relative; margin:8px 0 28px; padding-left:22px; }
  article div[data-type="toggle"] > summary{
    display:block; font-weight:500; list-style:none; cursor:pointer;
  }
  article div[data-type="toggle"] > summary::before{
    content:"▸"; position:absolute; left:0; color:var(--ink-soft); font-size:12px;
  }
  article div[data-type="toggle"].is-open > summary::before{ content:"▾"; }
  article div[data-type="toggle-content"]{ display:none; margin-top:8px; }
  article div[data-type="toggle"].is-open > div[data-type="toggle-content"]{ display:block; }
  article div[data-type="toggle-content"] p:last-child{ margin-bottom:0; }

  .clause{
    margin:8px 0 28px; padding:26px 28px; background:var(--surface-alt); border-radius:20px;
  }
  .clause p{ font-size:17px; line-height:1.6; margin:0 0 10px; font-weight:500; }
  .clause p:last-child{ margin-bottom:0; }

  .closing{ margin-top:8px; padding-top:32px; border-top:1px solid var(--divider); }
  .note{ margin-top:16px; font-size:13px; line-height:1.7; color:var(--ink-faint); }

  .tags{ display:flex; flex-wrap:wrap; gap:8px; margin-top:36px; }
  .tags span{
    font-size:13px; font-weight:500; color:var(--ink-soft);
    background:var(--surface-alt); border-radius:999px; padding:7px 14px;
  }

  /* ---- 편집(작성자 전용) ---- */
  #edit-fab{
    position:fixed; right:24px; bottom:24px; width:52px; height:52px; border-radius:50%;
    background:var(--accent); border:none; display:flex; align-items:center; justify-content:center;
    box-shadow:0 6px 20px rgba(0,0,0,.22); cursor:pointer; z-index:60;
  }
  #edit-fab svg{ width:20px; height:20px; }
  #edit-fab path{ stroke:#fff; }
  #edit-fab:focus-visible{ outline:2px solid var(--accent); outline-offset:3px; }

  /* 전체화면 편집 모드 — 좁은 팝업 대신 화면 전체를 편집 화면으로 씀 */
  #edit-backdrop{
    position:fixed; inset:0; z-index:70; background:var(--bg); color:var(--ink);
    display:flex; flex-direction:column; font-family:var(--font-text);
  }
  #edit-topbar{
    flex:0 0 auto; display:flex; align-items:center; justify-content:space-between; gap:12px;
    padding:calc(14px + env(safe-area-inset-top,0px)) 20px 14px; background:var(--surface);
    border-bottom:1px solid var(--divider);
  }
  #edit-topbar h2{ font-family:var(--font-display); font-size:17px; font-weight:700; margin:0; }
  #edit-scroll{
    flex:1 1 auto; overflow-y:auto; -webkit-overflow-scrolling:touch;
    padding:28px 20px calc(48px + env(safe-area-inset-bottom,0px));
  }
  #edit-scroll-inner{ max-width:680px; margin:0 auto; }
  .field-label{ font-size:13px; font-weight:600; color:var(--ink-soft); margin:20px 0 6px; }
  .field-label:first-of-type{ margin-top:0; }
  #edit-scroll input[type="text"], #edit-scroll textarea{
    width:100%; border:1px solid var(--divider); border-radius:12px; padding:12px 14px;
    font-family:var(--font-text); font-size:15px; line-height:1.6; color:var(--ink); background:var(--surface);
    resize:vertical;
  }
  #edit-scroll input[type="text"]:focus, #edit-scroll textarea:focus{
    outline:2px solid var(--accent); outline-offset:1px;
  }

  .rte-hint{
    font-size:12.5px; color:var(--ink-soft); background:var(--surface-alt);
    border:1px solid var(--divider); border-radius:10px; padding:9px 12px;
    margin:0 0 8px; line-height:1.6;
  }

  #edit-status{ font-size:13px; color:var(--accent); min-height:18px; margin-top:14px; }
  #edit-status.error{ color:#ff453a; }
  .btn-ghost, .btn-solid{
    font-family:var(--font-text); font-size:15px; font-weight:600; border:none;
    border-radius:980px; padding:9px 18px; cursor:pointer; flex:0 0 auto;
  }
  .btn-ghost{ background:transparent; color:var(--ink-soft); }
  .btn-solid{ background:var(--accent); color:#fff; }
  .btn-solid:disabled{ opacity:.5; cursor:default; }

  @media (max-width:520px){ .page{ padding:48px 18px 90px; } }
</style>`;

function renderNotFoundPage() {
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>페이지를 찾을 수 없어요</title>
<style>
  :root{ --bg:#f5f5f7; --ink:#1d1d1f; --ink-soft:#6e6e73; }
  @media (prefers-color-scheme:dark){ :root{ --bg:#000; --ink:#f5f5f7; --ink-soft:#a1a1a6; } }
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    background:var(--bg);color:var(--ink);
    font-family:-apple-system,BlinkMacSystemFont,"Inter","Apple SD Gothic Neo","Malgun Gothic",sans-serif;}
  .box{text-align:center;padding:24px;}
  h1{font-size:21px;margin:0 0 8px;font-weight:700;}
  p{color:var(--ink-soft);margin:0;font-size:15px;}
</style></head>
<body><div class="box"><h1>페이지를 찾을 수 없어요</h1><p>발행되지 않았거나 링크 주소가 정확하지 않아요.</p></div></body></html>`;
}

function renderColumnPage(record, opts) {
  const slug = (opts && opts.slug) || "";
  const title = String((record && record.title) || "제목 없음");
  const bodyRaw = String((record && record.body) || "");
  const bodyFormat = (record && record.bodyFormat) || "";
  const isBlockNoteJson = bodyFormat === "blocknote-json";
  const isRichBody = bodyFormat === "html";
  const keyPoints = Array.isArray(record && record.keyPoints) ? record.keyPoints.filter(Boolean) : [];
  const tags = Array.isArray(record && record.tags) ? record.tags.filter(Boolean) : [];

  // BlockNote JSON 본문은 blocks 배열로 파싱해둔다 — 실제 서식이 있는 HTML 변환
  // (blocksToHTMLLossy)은 BlockNote 라이브러리 자신이 브라우저에서만 할 수 있어서
  // (ProseMirror가 DOM을 다룸), 여기 서버에서는 순수 텍스트만 뽑아서 JS 로드 전
  // 임시 문단으로 깔아두고, 클라이언트에서 richtext/blocknote-view.js가 로드되면
  // 그 자리를 진짜 서식이 있는 HTML로 교체한다(점진적 향상).
  let blocks = [];
  if (isBlockNoteJson) {
    try {
      const parsed = JSON.parse(bodyRaw);
      if (Array.isArray(parsed)) blocks = parsed;
    } catch (e) {
      blocks = [];
    }
  }
  const plainTextBody = isBlockNoteJson ? plainTextFromBlocks(blocks) : "";

  // 리치 에디터(굵게/소제목/콜아웃/이미지)로 저장된 본문은 이미 HTML이라 다시 정제만 하고,
  // 레거시 평문 본문은 formatBody()로 문단·목록을 나눠 렌더링한다.
  // 이 bodyHtml은 열람 화면과 편집기 초기 내용에 그대로 재사용된다(=편집 시작 시점에
  // 눈에 보이던 그대로에서 이어서 고칠 수 있음).
  const bodyHtml = isBlockNoteJson
    ? (plainTextBody ? plainTextBody.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p)}</p>`).join("\n") : "")
    : isRichBody
    ? sanitizeColumnBody(bodyRaw)
    : formatBody(bodyRaw);

  // 글자 수·설명 미리보기는 반드시 정제된 bodyHtml(또는 blocks에서 뽑은 순수 텍스트)에서
  // 뽑아야 함 — bodyRaw(원본 입력)에서 뽑으면 <script>처럼 걸러낸 태그의 안쪽 텍스트가
  // og:description에 그대로 새어나감(실행은 안 되니 XSS는 아니지만, 걸러낸 내용이
  // 메타 태그로 노출되는 건 의도와 다름).
  const charCount = isBlockNoteJson ? plainTextBody.replace(/\s+/g, "").length : bodyHtml.replace(/<[^>]*>/g, "").length;
  const minutes = Math.max(1, Math.round(charCount / 500));
  const updatedAt = (record && record.updatedAt) || new Date().toISOString();
  const dateStr = updatedAt.slice(0, 10).replace(/-/g, ".");
  const category = tags[0] ? String(tags[0]).replace(/^#/, "") : "가이드";

  const descSource = isBlockNoteJson
    ? plainTextBody.replace(/\s+/g, " ").trim()
    : bodyHtml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const ogDescription = escapeHtml(descSource.slice(0, 120) + (descSource.length > 120 ? "…" : ""));

  const safeTitle = escapeHtml(title);

  const keyPointsHtml = keyPoints.length
    ? `
  <div class="checklist">
    <p class="checklist-label">핵심 포인트</p>
    <ul>
      ${keyPoints
        .map(
          (k) => `
      <li>
        <span class="check-mark"><svg viewBox="0 0 16 16" fill="none"><path d="M3 8.5L6.5 12L13 4.5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
        <p>${escapeHtml(k)}</p>
      </li>`
        )
        .join("")}
    </ul>
  </div>`
    : "";

  const tagsHtml = tags.length
    ? `<div class="tags">${tags.map((t) => `<span>#${escapeHtml(String(t).replace(/^#/, ""))}</span>`).join("")}</div>`
    : "";

  const notionPageId = (record && record.notionPageId) || null;
  const notionPageUrl = notionPageId ? `https://www.notion.so/${String(notionPageId).replace(/-/g, "")}` : null;

  const editData = jsonForScript({
    slug,
    keyPoints,
    tags,
    notionPageId,
    notionPageUrl,
  });
  const blocksForClient = isBlockNoteJson ? jsonForScript(blocks) : "null";

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeTitle}</title>
<meta property="og:type" content="article">
<meta property="og:title" content="${safeTitle}">
<meta property="og:description" content="${ogDescription}">
${SHARED_HEAD}
</head>
<body>
<div id="progress-track"><div id="progress-bar"></div></div>
<div class="page">
  <header>
    <div class="eyebrow-row">
      <span class="eyebrow-tag">${escapeHtml(category)}</span>
      <span class="dot"></span>
      <span>${dateStr}</span>
      <span class="dot"></span>
      <span>읽는 시간 약 ${minutes}분</span>
    </div>
    <h1>${safeTitle}</h1>
  </header>

  ${keyPointsHtml}

  <article id="article-body">
    <div id="article-body-content">${bodyHtml}</div>
    <div class="closing">
      <p class="note">이 글은 일반적인 정보 제공을 목적으로 하며, 구체적인 사안은 관련 서류 확인과 전문가 상담을 함께 거치는 것을 권장합니다.</p>
    </div>
    ${tagsHtml}
  </article>
</div>

<button id="edit-fab" type="button" aria-label="편집" hidden>
  <svg viewBox="0 0 24 24" fill="none"><path d="M4 20h4L18.5 9.5a2.121 2.121 0 0 0-3-3L5.5 16.5v3.5Z" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
</button>

<div id="edit-backdrop" role="dialog" aria-modal="true" aria-labelledby="edit-title-label" hidden>
  <div id="edit-topbar">
    <button class="btn-ghost" id="edit-cancel" type="button">닫기</button>
    <h2 id="edit-title-label">칼럼 정보 수정</h2>
    <button class="btn-solid" id="edit-save" type="button">저장</button>
  </div>
  <div id="edit-scroll">
    <div id="edit-scroll-inner">
      <div id="edit-notion-section"></div>
      <div class="field-label">핵심 포인트 (한 줄에 하나씩)</div>
      <textarea id="edit-keypoints" rows="4"></textarea>
      <div class="field-label">태그 (쉼표로 구분)</div>
      <input type="text" id="edit-tags">
      <div id="edit-status"></div>
    </div>
  </div>
</div>

<script>
  (function(){
    var bar = document.getElementById('progress-bar');
    function updateProgress(){
      var h = document.documentElement;
      var scrollable = h.scrollHeight - h.clientHeight;
      var ratio = scrollable > 0 ? (h.scrollTop / scrollable) : 0;
      bar.style.width = (Math.min(1, Math.max(0, ratio)) * 100) + '%';
    }
    window.addEventListener('scroll', updateProgress, { passive:true });
    window.addEventListener('resize', updateProgress);
    updateProgress();
  })();

  (function(){
    // 토글 블록은 열람 페이지에서도 눌러서 여닫을 수 있어야 한다(실제 노션 공개
    // 페이지와 동일) — 에디터 없이 순수 클릭 핸들러만으로 처리.
    // (예전 Tiptap 기반 레거시 레코드에만 남아있는 마크업 — BlockNote로 저장된
    // 새 레코드는 아래 블록에서 자체적으로 렌더링한다.)
    document.querySelectorAll('article div[data-type="toggle"] > summary').forEach(function(s){
      s.addEventListener('click', function(){
        s.parentElement.classList.toggle('is-open');
      });
    });
  })();

  (function(){
    // BlockNote JSON 본문은 페이지 로드 시엔 서버가 미리 깔아둔 단순 문단
    // 텍스트만 보이다가, 이 스크립트가 로드되면 실제 서식이 있는 HTML로
    // 바뀐다(점진적 향상 — 방문자 대부분은 React/BlockNote 없이도 내용을 읽을 수 있음).
    var BLOCKS = ${blocksForClient};
    if(BLOCKS && BLOCKS.length){
      var contentEl = document.getElementById('article-body-content');
      import('/richtext/blocknote-view.js').then(function(mod){
        return mod.renderBlocksInto(contentEl, BLOCKS);
      }).catch(function(){ /* 실패해도 서버가 깔아둔 문단 텍스트는 이미 보이는 중 */ });
    }
  })();

  (function(){
    var DATA = ${editData};
    var fab = document.getElementById('edit-fab');
    var backdrop = document.getElementById('edit-backdrop');
    var notionSection = document.getElementById('edit-notion-section');
    var keyPointsInput = document.getElementById('edit-keypoints');
    var tagsInput = document.getElementById('edit-tags');
    var status = document.getElementById('edit-status');
    var saveBtn = document.getElementById('edit-save');
    var cancelBtn = document.getElementById('edit-cancel');

    // 본문(제목 포함)은 이 앱 안에서 직접 고치지 않는다 — 노션 페이지에서 고친 뒤
    // "노션에서 새로고침"을 눌러 반영하거나, 노션 연동이 없는 옛 페이지는 마케팅 툴
    // 앱에서 다시 재작성해서 발행한다.
    if(DATA.notionPageId){
      notionSection.innerHTML =
        '<div class="rte-hint">📝 본문(제목 포함)은 노션 페이지에서 직접 수정하세요. 다 고치셨으면 아래 버튼으로 최신 내용을 가져와서 다시 발행할 수 있어요.</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:0 0 16px;">' +
        '<a class="btn-ghost" style="border:1px solid var(--divider);border-radius:980px;padding:9px 16px;text-decoration:none;" href="' + DATA.notionPageUrl + '" target="_blank" rel="noopener">노션에서 열기 ↗</a>' +
        '<button class="btn-solid" id="refresh-from-notion-btn" type="button" style="background:var(--ink);">노션에서 새로고침해서 발행</button>' +
        '</div>';
      document.getElementById('refresh-from-notion-btn').addEventListener('click', function(){
        var btn = this;
        btn.disabled = true; status.textContent = '노션에서 가져오는 중...'; status.className = '';
        fetch('/api/notion', {
          method:'POST', credentials:'same-origin',
          headers:{ 'Content-Type':'application/json' },
          body: JSON.stringify({ slug: DATA.slug, notionPageId: DATA.notionPageId }),
        }).then(function(res){
          if(res.status === 401){ throw new Error('로그인이 만료됐어요. 마케팅 툴에 다시 로그인한 뒤 시도해주세요.'); }
          return res.json().then(function(data){
            if(!res.ok) throw new Error(data.error || '노션에서 가져오지 못했어요.');
            return data;
          });
        }).then(function(){
          status.textContent = '노션 내용으로 갱신됐어요. 새로고침할게요...'; status.className = '';
          setTimeout(function(){ window.location.reload(); }, 600);
        }).catch(function(e){
          status.textContent = e.message; status.className = 'error';
          btn.disabled = false;
        });
      });
    } else {
      notionSection.innerHTML =
        '<div class="rte-hint">이 페이지는 노션과 연결돼 있지 않아요. 본문(제목 포함)을 고치려면 마케팅 툴 앱에서 다시 재작성해서 발행하거나, 노션에 업로드한 뒤 "노션 내용으로 발행"을 사용해주세요.</div>';
    }

    function openEditor(){
      keyPointsInput.value = (DATA.keyPoints || []).join('\\n');
      tagsInput.value = (DATA.tags || []).join(', ');
      status.textContent = ''; status.className = '';
      backdrop.hidden = false;
      document.body.style.overflow = 'hidden';
    }
    function closeEditor(){
      backdrop.hidden = true;
      document.body.style.overflow = '';
    }

    fab.addEventListener('click', openEditor);
    cancelBtn.addEventListener('click', closeEditor);

    saveBtn.addEventListener('click', function(){
      var payload = {
        slug: DATA.slug,
        keyPoints: keyPointsInput.value.split('\\n').map(function(s){ return s.trim(); }).filter(Boolean),
        tags: tagsInput.value.split(',').map(function(s){ return s.trim(); }).filter(Boolean),
      };
      saveBtn.disabled = true; status.textContent = '저장하는 중...'; status.className = '';
      fetch('/api/publish-page', {
        method:'POST', credentials:'same-origin',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify(payload),
      }).then(function(res){
        if(res.status === 401){ throw new Error('로그인이 만료됐어요. 마케팅 툴에 다시 로그인한 뒤 시도해주세요.'); }
        return res.json().then(function(data){
          if(!res.ok) throw new Error(data.error || '저장에 실패했어요.');
          return data;
        });
      }).then(function(){
        status.textContent = '저장됐어요. 새로고침할게요...'; status.className = '';
        setTimeout(function(){ window.location.reload(); }, 600);
      }).catch(function(e){
        status.textContent = e.message; status.className = 'error';
        saveBtn.disabled = false;
      });
    });

    fetch('/api/session', { credentials:'same-origin' })
      .then(function(res){ return res.ok ? res.json() : { authenticated:false }; })
      .then(function(data){ if(data && data.authenticated) fab.hidden = false; })
      .catch(function(){});
  })();
</script>
</body>
</html>`;
}

module.exports = { renderColumnPage, renderNotFoundPage };
