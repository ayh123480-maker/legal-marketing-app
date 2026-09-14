/**
 * 재작성된 칼럼을 "완성된 칼럼처럼 보이는" 공개 웹페이지(HTML)로 렌더링한다.
 * api/p/[slug].js가 이 함수를 호출해서 그대로 브라우저에 내려준다.
 *
 * 등기부등본 특유의 옅은 민트빛 종이 톤 + 도장(직인) 모티프로 "법률 문서" 느낌을 낸
 * 하나의 고정된 비주얼 아이덴티티를 모든 칼럼에 재사용한다 (칼럼마다 디자인이 바뀌면
 * 브랜드 일관성이 없어지므로 의도적으로 고정).
 */

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* 본문 텍스트를 문단 단위로 나눠 HTML로 바꾼다.
   - "· "/"- "/"* "로 시작하는 줄이 이어지면 특약·조항 인용처럼 강조 박스로 렌더링
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

function renderNotFoundPage() {
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>페이지를 찾을 수 없어요</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    background:#EEF3EA;color:#1D2B27;font-family:'Noto Sans KR','Malgun Gothic',sans-serif;}
  .box{text-align:center;padding:24px;}
  h1{font-size:20px;margin:0 0 8px;}
  p{color:#56655F;margin:0;font-size:14px;}
</style></head>
<body><div class="box"><h1>페이지를 찾을 수 없어요</h1><p>발행되지 않았거나 링크 주소가 정확하지 않아요.</p></div></body></html>`;
}

function renderColumnPage(record) {
  const title = String((record && record.title) || "제목 없음");
  const bodyRaw = String((record && record.body) || "");
  const keyPoints = Array.isArray(record && record.keyPoints) ? record.keyPoints.filter(Boolean) : [];
  const tags = Array.isArray(record && record.tags) ? record.tags.filter(Boolean) : [];

  const charCount = bodyRaw.length;
  const minutes = Math.max(1, Math.round(charCount / 500));
  const updatedAt = (record && record.updatedAt) || new Date().toISOString();
  const dateStr = updatedAt.slice(0, 10).replace(/-/g, ".");
  const category = tags[0] ? String(tags[0]).replace(/^#/, "") : "법률 인사이트";

  const descSource = bodyRaw.replace(/\s+/g, " ").trim();
  const ogDescription = escapeHtml(descSource.slice(0, 120) + (descSource.length > 120 ? "…" : ""));

  const bodyHtml = formatBody(bodyRaw);
  const safeTitle = escapeHtml(title);

  const keyPointsHtml = keyPoints.length
    ? `
  <div class="checklist">
    <p class="checklist-label">필독 체크리스트</p>
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

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeTitle}</title>
<meta property="og:type" content="article">
<meta property="og:title" content="${safeTitle}">
<meta property="og:description" content="${ogDescription}">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@700;900&family=Noto+Sans+KR:wght@400;500;700&family=JetBrains+Mono:wght@500;600&display=swap">
<style>
  :root{
    --paper: #EEF3EA;
    --paper-raised: #F8FBF5;
    --ink: #1D2B27;
    --ink-soft: #56655F;
    --ink-faint: #8B978F;
    --seal: #9C3B2E;
    --gold: #8C6C33;
    --line: #C9D5C3;
    --shadow: 0 1px 0 rgba(29,43,39,0.06);
  }
  @media (prefers-color-scheme: dark){
    :root:not([data-theme="light"]){
      --paper:#101714; --paper-raised:#17201C; --ink:#E8EFE7; --ink-soft:#A3B2A9;
      --ink-faint:#6D7A73; --seal:#E2694F; --gold:#D2AE6C; --line:#2B372F; --shadow:none;
    }
  }
  :root[data-theme="dark"]{
    --paper:#101714; --paper-raised:#17201C; --ink:#E8EFE7; --ink-soft:#A3B2A9;
    --ink-faint:#6D7A73; --seal:#E2694F; --gold:#D2AE6C; --line:#2B372F; --shadow:none;
  }
  *{ box-sizing:border-box; }
  html,body{ margin:0; }
  body{
    background: var(--paper); color: var(--ink);
    font-family:'Noto Sans KR','Malgun Gothic',-apple-system,sans-serif;
    -webkit-font-smoothing:antialiased;
  }
  @media (prefers-reduced-motion:no-preference){ html{ scroll-behavior:smooth; } }

  #progress-track{ position:fixed; top:0; left:0; right:0; height:3px; z-index:50; }
  #progress-bar{ height:100%; width:0%; background:linear-gradient(90deg, var(--seal), var(--gold)); }

  .page{ max-width:720px; margin:0 auto; padding:56px 24px 80px; }

  .masthead{
    display:flex; align-items:flex-start; justify-content:space-between; gap:24px; flex-wrap:wrap;
    padding-bottom:28px; border-bottom:1px solid var(--line);
  }
  .masthead-text{ flex:1 1 380px; min-width:0; }
  .eyebrow-row{
    display:flex; align-items:center; gap:10px; flex-wrap:wrap;
    font-family:'JetBrains Mono',Consolas,monospace; font-size:12px; letter-spacing:.08em;
    text-transform:uppercase; color:var(--ink-soft); margin-bottom:18px;
  }
  .eyebrow-tag{ color:var(--seal); font-weight:600; }
  .dot{ width:3px; height:3px; border-radius:50%; background:var(--ink-faint); }
  h1{
    font-family:'Noto Serif KR',serif; font-weight:900;
    font-size:clamp(1.6rem, 4.2vw, 2.4rem); line-height:1.38; margin:0;
    text-wrap:balance; letter-spacing:-.01em;
  }
  .stamp{ flex:0 0 auto; width:96px; height:96px; transform:rotate(-9deg); opacity:.92; }
  .stamp svg{ width:100%; height:100%; display:block; }
  .stamp text{ font-family:'Noto Serif KR',serif; font-weight:900; fill:var(--seal); }
  .stamp circle{ stroke:var(--seal); }

  .intro-gap{ height:32px; }

  .checklist{
    margin:0 0 36px; background:var(--paper-raised); border:1px solid var(--line);
    border-radius:4px; padding:24px 24px 22px; box-shadow:var(--shadow);
  }
  .checklist-label{
    font-family:'JetBrains Mono',Consolas,monospace; font-size:11.5px; letter-spacing:.1em;
    text-transform:uppercase; color:var(--gold); font-weight:600; margin:0 0 16px;
  }
  .checklist ul{ list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:14px; }
  .checklist li{ display:flex; gap:12px; align-items:flex-start; }
  .check-mark{
    flex:0 0 auto; width:19px; height:19px; margin-top:2px; border:1.5px solid var(--seal);
    border-radius:4px; display:flex; align-items:center; justify-content:center;
  }
  .check-mark svg{ width:12px; height:12px; }
  .check-mark path{ stroke:var(--seal); }
  .checklist p{ margin:0; font-size:15.5px; line-height:1.75; color:var(--ink); }

  article p{ font-size:16.5px; line-height:1.95; margin:0 0 20px; color:var(--ink); }

  .clause{
    position:relative; margin:8px 0 28px; padding:20px 22px 18px 26px;
    background:var(--paper-raised); border-left:3px solid var(--seal); border-radius:0 4px 4px 0;
  }
  .clause p{ font-size:15.5px; line-height:1.85; margin:0 0 8px; font-style:italic; }
  .clause p:last-child{ margin-bottom:0; }

  .closing{ margin-top:8px; padding-top:28px; border-top:1px solid var(--line); }
  .note{ margin-top:20px; font-size:13px; line-height:1.8; color:var(--ink-faint); }

  .tags{ display:flex; flex-wrap:wrap; gap:8px; margin-top:32px; }
  .tags span{
    font-family:'JetBrains Mono',Consolas,monospace; font-size:12px; color:var(--ink-soft);
    background:var(--paper-raised); border:1px solid var(--line); border-radius:999px; padding:5px 12px;
  }

  @media (max-width:520px){
    .page{ padding:40px 18px 64px; }
    .stamp{ width:72px; height:72px; }
  }
</style>
</head>
<body>
<div id="progress-track"><div id="progress-bar"></div></div>
<div class="page">
  <header class="masthead">
    <div class="masthead-text">
      <div class="eyebrow-row">
        <span class="eyebrow-tag">${escapeHtml(category)}</span>
        <span class="dot"></span>
        <span>${dateStr}</span>
        <span class="dot"></span>
        <span>읽는 시간 약 ${minutes}분</span>
      </div>
      <h1>${safeTitle}</h1>
    </div>
    <div class="stamp" aria-hidden="true">
      <svg viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="46" fill="none" stroke-width="2"/>
        <circle cx="50" cy="50" r="39" fill="none" stroke-width="1"/>
        <text x="50" y="46" font-size="17" text-anchor="middle">법률</text>
        <text x="50" y="66" font-size="17" text-anchor="middle">인사이트</text>
      </svg>
    </div>
  </header>

  <div class="intro-gap"></div>

  ${keyPointsHtml}

  <article>
    ${bodyHtml}
    <div class="closing">
      <p class="note">이 글은 일반적인 정보 제공을 목적으로 하며, 구체적인 사안은 관련 서류 확인과 전문가 상담을 함께 거치는 것을 권장합니다.</p>
    </div>
    ${tagsHtml}
  </article>
</div>
<script>
  (function(){
    var bar = document.getElementById('progress-bar');
    function update(){
      var h = document.documentElement;
      var scrollable = h.scrollHeight - h.clientHeight;
      var ratio = scrollable > 0 ? (h.scrollTop / scrollable) : 0;
      bar.style.width = (Math.min(1, Math.max(0, ratio)) * 100) + '%';
    }
    window.addEventListener('scroll', update, { passive:true });
    window.addEventListener('resize', update);
    update();
  })();
</script>
</body>
</html>`;
}

module.exports = { renderColumnPage, renderNotFoundPage };
