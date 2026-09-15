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
 * 편집 화면은 좁은 팝업이 아니라 전체화면 리치 에디터(굵게·소제목·콜아웃·이미지)이고,
 * 본문은 record.bodyFormat이 "html"이면 그 리치 에디터에서 나온 HTML을 그대로 쓰고
 * (레거시 레코드처럼) 없으면 평문으로 보고 formatBody()로 문단을 나눠 렌더링한다.
 */

const { sanitizeColumnBody } = require("./sanitizeColumnBody");

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

  /* article > div:not(.callout)도 같이 잡아두는 이유: 콘텐트에디터블에서 Enter로 줄바꿈할 때
     브라우저(특히 소제목 블록 뒤)가 <p> 대신 <div>를 만드는 경우가 있어서, 태그와 무관하게
     본문 문단은 항상 같은 크기로 보이게 함 */
  article p, article > div:not(.callout), #edit-body p, #edit-body > div:not(.callout){
    font-size:19px; line-height:1.63; margin:0 0 24px; color:var(--ink); font-weight:400;
  }
  article h2, #edit-body h2{
    font-family:var(--font-display); font-weight:800; font-size:1.5rem; line-height:1.3;
    letter-spacing:-.015em; color:var(--ink); margin:8px 0 18px;
  }
  article h3, #edit-body h3{
    font-family:var(--font-display); font-weight:700; font-size:1.2rem; line-height:1.4;
    color:var(--ink); margin:8px 0 14px;
  }
  article img, #edit-body img{
    max-width:100%; height:auto; display:block; border-radius:16px; margin:8px 0 24px;
  }
  .callout, #edit-body .callout{
    margin:8px 0 28px; padding:20px 22px; background:var(--surface-alt);
    border-left:3px solid var(--accent); border-radius:14px;
    font-size:16px; line-height:1.7; color:var(--ink);
  }

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

  /* 리치 텍스트(contenteditable) 입력 영역 — 상단 고정 툴바 대신 노션처럼
     줄 왼쪽에 마우스를 대면 뜨는 "+" 버튼(블록 삽입)과, 텍스트를 선택했을 때만
     뜨는 작은 서식 버블(굵게)로 서식 UI를 대체함 */
  /* "+" 버튼을 절대위치로 왼쪽 바깥(음수 left)에 띄웠더니, 마우스가 본문 텍스트에서
     버튼 쪽으로 넘어가는 순간 #edit-body-wrap의 실제 렌더링 박스 바깥으로 나가버려서
     (음수 left로 튀어나온 자식은 부모의 히트테스트 영역에 안 잡힘) mouseleave가 먼저
     발동해 버튼이 코앞에서 사라지는 문제가 있었음 — 그래서 왼쪽에 진짜 여백(padding)을
     떼어두고 그 안쪽에 버튼을 놓는 방식으로 바꿈(버튼이 wrap의 실제 박스 안에 있어야
     마우스가 거기로 이동해도 mouseleave가 안 터짐). */
  #edit-body-wrap{ position:relative; padding-left:34px; }
  #edit-body{
    min-height:44vh; border:1px solid var(--divider); border-radius:12px; padding:12px 14px;
    font-size:15px; line-height:1.6; color:var(--ink); background:var(--surface); cursor:text;
  }
  #edit-body:focus{ outline:2px solid var(--accent); outline-offset:1px; }
  #edit-body:empty:before{ content:attr(data-placeholder); color:var(--ink-faint); }

  #block-plus-btn{
    position:absolute; left:0; width:26px; height:26px; border-radius:7px;
    border:1px solid var(--divider); background:var(--surface); color:var(--ink-soft);
    font-size:17px; line-height:1; display:flex; align-items:center; justify-content:center;
    cursor:pointer; padding:0; z-index:5;
  }
  #block-plus-btn:hover{ background:var(--surface-alt); color:var(--ink); }

  #block-plus-menu{
    position:absolute; left:0; min-width:150px; background:var(--surface);
    border:1px solid var(--divider); border-radius:12px; box-shadow:0 8px 28px rgba(0,0,0,.18);
    padding:6px; z-index:10; display:flex; flex-direction:column; gap:1px;
  }
  #block-plus-menu button{
    display:block; width:100%; text-align:left; background:none; border:none;
    padding:8px 10px; border-radius:8px; font-size:14px; font-family:var(--font-text);
    color:var(--ink); cursor:pointer;
  }
  #block-plus-menu button:hover{ background:var(--surface-alt); }

  #selection-bubble{
    position:absolute; background:#1d1d1f; border-radius:8px; padding:4px; z-index:10;
    box-shadow:0 6px 18px rgba(0,0,0,.28); display:flex; gap:2px;
  }
  #selection-bubble button{
    width:28px; height:28px; border:none; background:none; color:#fff;
    border-radius:6px; cursor:pointer; font-size:14px; font-family:var(--font-text);
  }
  #selection-bubble button:hover{ background:rgba(255,255,255,.16); }
  #selection-bubble button.active{ background:var(--accent); }
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
  const isRichBody = (record && record.bodyFormat) === "html";
  const keyPoints = Array.isArray(record && record.keyPoints) ? record.keyPoints.filter(Boolean) : [];
  const tags = Array.isArray(record && record.tags) ? record.tags.filter(Boolean) : [];

  // 리치 에디터(굵게/소제목/콜아웃/이미지)로 저장된 본문은 이미 HTML이라 다시 정제만 하고,
  // 레거시 평문 본문은 formatBody()로 문단·목록을 나눠 렌더링한다.
  // 이 bodyHtml은 열람 화면과 편집기 초기 내용에 그대로 재사용된다(=편집 시작 시점에
  // 눈에 보이던 그대로에서 이어서 고칠 수 있음).
  const bodyHtml = isRichBody ? sanitizeColumnBody(bodyRaw) : formatBody(bodyRaw);

  // 글자 수·설명 미리보기는 반드시 정제된 bodyHtml에서 뽑아야 함 — bodyRaw(원본 입력)에서
  // 뽑으면 <script>처럼 걸러낸 태그의 안쪽 텍스트가 og:description에 그대로 새어나감
  // (실행은 안 되니 XSS는 아니지만, 걸러낸 내용이 메타 태그로 노출되는 건 의도와 다름).
  const charCount = bodyHtml.replace(/<[^>]*>/g, "").length;
  const minutes = Math.max(1, Math.round(charCount / 500));
  const updatedAt = (record && record.updatedAt) || new Date().toISOString();
  const dateStr = updatedAt.slice(0, 10).replace(/-/g, ".");
  const category = tags[0] ? String(tags[0]).replace(/^#/, "") : "가이드";

  const descSource = bodyHtml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
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

  const editData = jsonForScript({
    slug,
    title,
    bodyHtml,
    keyPoints,
    tags,
  });

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
    ${bodyHtml}
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
    <h2 id="edit-title-label">칼럼 편집</h2>
    <button class="btn-solid" id="edit-save" type="button">저장</button>
  </div>
  <div id="edit-scroll">
    <div id="edit-scroll-inner">
      <div class="field-label">제목</div>
      <input type="text" id="edit-title">
      <div class="field-label">본문 <span style="font-weight:400;color:var(--ink-faint);">— 줄 왼쪽에 마우스를 대면 + 버튼이 떠요</span></div>
      <div id="edit-body-wrap">
        <button type="button" id="block-plus-btn" aria-label="블록 추가" hidden>+</button>
        <div id="block-plus-menu" hidden>
          <button type="button" data-block-type="P">텍스트</button>
          <button type="button" data-block-type="H2">제목 1</button>
          <button type="button" data-block-type="H3">제목 2</button>
          <button type="button" data-block-type="callout">💡 콜아웃</button>
          <button type="button" data-block-type="image">🖼️ 이미지</button>
        </div>
        <div id="selection-bubble" hidden>
          <button type="button" id="selection-bold-btn" title="굵게 (Ctrl/Cmd+B)"><strong>B</strong></button>
        </div>
        <div id="edit-body" contenteditable="true" data-placeholder="본문을 입력하세요"></div>
      </div>
      <input type="file" id="edit-image-input" accept="image/*" hidden>
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
    var DATA = ${editData};
    var fab = document.getElementById('edit-fab');
    var backdrop = document.getElementById('edit-backdrop');
    var titleInput = document.getElementById('edit-title');
    var bodyInput = document.getElementById('edit-body');
    var keyPointsInput = document.getElementById('edit-keypoints');
    var tagsInput = document.getElementById('edit-tags');
    var status = document.getElementById('edit-status');
    var saveBtn = document.getElementById('edit-save');
    var cancelBtn = document.getElementById('edit-cancel');
    var bodyWrap = document.getElementById('edit-body-wrap');
    var plusBtn = document.getElementById('block-plus-btn');
    var plusMenu = document.getElementById('block-plus-menu');
    var selectionBubble = document.getElementById('selection-bubble');
    var selectionBoldBtn = document.getElementById('selection-bold-btn');
    var imageInput = document.getElementById('edit-image-input');
    var hoveredBlock = null;
    var pendingImageTarget = null;

    function openEditor(){
      titleInput.value = DATA.title || '';
      bodyInput.innerHTML = DATA.bodyHtml || '';
      keyPointsInput.value = (DATA.keyPoints || []).join('\\n');
      tagsInput.value = (DATA.tags || []).join(', ');
      status.textContent = ''; status.className = '';
      backdrop.hidden = false;
      document.body.style.overflow = 'hidden';
      // Enter로 줄바꿈할 때 <div>가 아니라 <p>가 생기게 강제 — 안 하면 문단마다
      // article/에디터 CSS(article p{...})가 안 먹어서 글자 크기가 들쭉날쭉해짐.
      // hidden이 풀려서 실제로 보이는 상태가 된 다음에 불러야 브라우저가 반영한다.
      bodyInput.focus();
      document.execCommand('defaultParagraphSeparator', false, 'p');
    }
    function closeEditor(){
      backdrop.hidden = true;
      document.body.style.overflow = '';
      hidePlusUI();
      selectionBubble.hidden = true;
    }

    fab.addEventListener('click', openEditor);
    cancelBtn.addEventListener('click', closeEditor);

    /* ---- 줄 왼쪽 "+" 버튼: 마우스가 올라간 블록 옆에 뜨고, 눌러서 그 아래에
       새 블록(텍스트/제목/콜아웃/이미지)을 끼워 넣는 노션 스타일 UI ---- */
    function hidePlusUI(){
      plusBtn.hidden = true;
      plusMenu.hidden = true;
    }

    function positionPlusBtn(el){
      var wrapRect = bodyWrap.getBoundingClientRect();
      var elRect = el.getBoundingClientRect();
      plusBtn.style.top = Math.max(0, elRect.top - wrapRect.top) + 'px';
      plusBtn.hidden = false;
    }

    bodyWrap.addEventListener('mousemove', function(e){
      if(!bodyInput.contains(e.target)) return;
      var el = e.target;
      if(el !== bodyInput){
        while(el.parentNode && el.parentNode !== bodyInput) el = el.parentNode;
      }
      // 문단과 문단 사이 여백(margin)에 마우스가 있으면 e.target이 특정 블록이 아니라
      // #edit-body 자기 자신으로 잡힌다 — 이걸 그대로 "호버 대상"으로 삼으면 버튼이
      // 매번 에디터 맨 위(#edit-body의 top)로 튕겨 올라간다. 본문이 비어있지 않은 이상
      // 이런 경우는 무시하고 마지막으로 잡은 블록 위치를 그대로 유지한다.
      if(el === bodyInput && bodyInput.firstChild) return;
      if(el !== hoveredBlock){
        hoveredBlock = el;
        positionPlusBtn(el);
      }
    });
    bodyWrap.addEventListener('mouseleave', function(){
      if(plusMenu.hidden) plusBtn.hidden = true;
    });

    plusBtn.addEventListener('click', function(e){
      e.stopPropagation();
      if(!plusMenu.hidden){ plusMenu.hidden = true; return; }
      var wrapRect = bodyWrap.getBoundingClientRect();
      var btnRect = plusBtn.getBoundingClientRect();
      plusMenu.style.top = (btnRect.bottom - wrapRect.top + 4) + 'px';
      plusMenu.hidden = false;
    });
    document.addEventListener('click', function(e){
      if(!plusMenu.hidden && e.target !== plusBtn && !plusMenu.contains(e.target)) plusMenu.hidden = true;
    });

    function insertAfterHovered(newEl){
      if(!hoveredBlock || hoveredBlock === bodyInput){ bodyInput.appendChild(newEl); return; }
      hoveredBlock.parentNode.insertBefore(newEl, hoveredBlock.nextSibling);
    }
    function selectNodeText(node){
      var range = document.createRange();
      range.selectNodeContents(node);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    function placeCaretStart(node){
      var range = document.createRange();
      range.selectNodeContents(node);
      range.collapse(true);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }

    function resizeImageFile(file){
      return new Promise(function(resolve, reject){
        var reader = new FileReader();
        reader.onload = function(){
          var img = new Image();
          img.onload = function(){
            var maxW = 1280;
            var scale = Math.min(1, maxW / img.naturalWidth);
            var w = Math.max(1, Math.round(img.naturalWidth * scale));
            var h = Math.max(1, Math.round(img.naturalHeight * scale));
            var canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.82));
          };
          img.onerror = function(){ reject(new Error('이미지를 불러오지 못했어요.')); };
          img.src = reader.result;
        };
        reader.onerror = function(){ reject(new Error('파일을 읽지 못했어요.')); };
        reader.readAsDataURL(file);
      });
    }

    plusMenu.querySelectorAll('button[data-block-type]').forEach(function(btn){
      btn.addEventListener('click', function(){
        plusMenu.hidden = true;
        var type = btn.dataset.blockType;
        var target = hoveredBlock;
        if(type === 'image'){ pendingImageTarget = target; imageInput.click(); return; }

        var newEl;
        if(type === 'callout'){
          newEl = document.createElement('div');
          newEl.className = 'callout';
          newEl.textContent = '💡 여기에 강조하고 싶은 내용을 적어주세요.';
        }else{
          newEl = document.createElement(type === 'P' ? 'p' : type.toLowerCase());
          newEl.appendChild(document.createElement('br'));
        }
        hoveredBlock = target;
        insertAfterHovered(newEl);
        bodyInput.focus();
        if(type === 'callout') selectNodeText(newEl); else placeCaretStart(newEl);
      });
    });

    imageInput.addEventListener('change', function(){
      var file = imageInput.files && imageInput.files[0];
      var target = pendingImageTarget;
      pendingImageTarget = null;
      imageInput.value = '';
      if(!file) return;
      resizeImageFile(file).then(function(dataUrl){
        var img = document.createElement('img');
        img.src = dataUrl; img.alt = '';
        hoveredBlock = target;
        insertAfterHovered(img);
      }).catch(function(e){
        status.textContent = e.message; status.className = 'error';
      });
    });

    /* ---- 텍스트 선택 시에만 뜨는 작은 서식 버블(굵게) + 단축키 ---- */
    bodyInput.addEventListener('keydown', function(e){
      var isMod = e.metaKey || e.ctrlKey;
      if(isMod && (e.key === 'b' || e.key === 'B')){
        e.preventDefault();
        document.execCommand('bold');
      }
    });
    selectionBoldBtn.addEventListener('mousedown', function(e){
      e.preventDefault(); // contenteditable의 선택 영역이 풀리지 않게 함
      document.execCommand('bold');
      selectionBoldBtn.classList.toggle('active', document.queryCommandState('bold'));
    });
    document.addEventListener('selectionchange', function(){
      if(backdrop.hidden){ selectionBubble.hidden = true; return; }
      var sel = window.getSelection();
      if(!sel || sel.rangeCount === 0 || sel.isCollapsed || !bodyInput.contains(sel.anchorNode)){
        selectionBubble.hidden = true;
        return;
      }
      var rect = sel.getRangeAt(0).getBoundingClientRect();
      if(!rect || (rect.width === 0 && rect.height === 0)){ selectionBubble.hidden = true; return; }
      var wrapRect = bodyWrap.getBoundingClientRect();
      selectionBubble.style.top = Math.max(0, rect.top - wrapRect.top - 38) + 'px';
      selectionBubble.style.left = Math.max(0, rect.left - wrapRect.left + rect.width / 2 - 18) + 'px';
      selectionBubble.hidden = false;
      selectionBoldBtn.classList.toggle('active', document.queryCommandState('bold'));
    });

    saveBtn.addEventListener('click', function(){
      var payload = {
        slug: DATA.slug,
        title: titleInput.value.trim(),
        body: bodyInput.innerHTML.trim(),
        bodyFormat: 'html',
        keyPoints: keyPointsInput.value.split('\\n').map(function(s){ return s.trim(); }).filter(Boolean),
        tags: tagsInput.value.split(',').map(function(s){ return s.trim(); }).filter(Boolean),
      };
      if(!payload.title || !bodyInput.textContent.trim()){
        status.textContent = '제목과 본문은 비워둘 수 없어요.'; status.className = 'error';
        return;
      }
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
