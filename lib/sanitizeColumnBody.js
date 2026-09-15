/**
 * 칼럼 본문 리치 에디터(작성자 전용 전체화면 편집기)에서 저장/조회되는 HTML을 정제한다.
 * 이 HTML은 로그인 없이 열람 가능한 공개 페이지(api/p/[slug].js)에 그대로 삽입되므로,
 * 저장 시(api/publish-page.js)와 렌더 시(lib/renderColumnPage.js) 두 지점에서 모두
 * 이 함수를 거치게 해서 스크립트·이벤트 핸들러 등이 섞여 들어가지 않게 막는다.
 *
 * 원래 sanitize-html 패키지로 구현했었는데, Vercel 서버리스 함수가 그 패키지(와 딸려오는
 * 하위 의존성들)를 제대로 번들링하지 못해서 api/p/[slug].js가 require 시점에 죽어버리는
 * 문제가 있었다(2026-09-15 — /c/:slug가 슬러그를 가리지 않고 전부 FUNCTION_INVOCATION_FAILED
 * 500을 냄). 그래서 외부 패키지 없이 직접 구현함 — 허용 태그가 굵게·소제목·콜아웃·이미지·
 * 링크뿐인 좁은 화이트리스트라 직접 파서를 짜도 감당할 수 있는 범위.
 *
 * 태그/속성 이름을 정규식으로 잘라내되, 출력은 항상 "허용된 속성 이름 → 검증된 값"만
 * 가지고 새로 조립한다(입력 문자열의 속성 구간을 그대로 베껴 쓰지 않음). 그래서 태그
 * 경계를 잘못 잘라내는 경우가 있어도(예: 속성값 안에 '>'가 섞여 있는 극단적인 입력)
 * 최악의 결과는 내용이 일부 사라지는 것이지, 허용 안 된 태그·속성이 그대로 새어나가는
 * 것은 아니다.
 */

// 태그 이름 → 허용 속성 이름 목록
const ALLOWED_TAGS = {
  p: [], br: [], strong: [], b: [], em: [], i: [], u: [], s: [],
  h2: [], h3: [], h4: [], ul: [], ol: [], li: [], blockquote: [],
  div: ["class"],
  span: ["class"],
  img: ["src", "alt"],
  a: ["href"],
};

// class 속성은 자유 문자열을 허용하면 CSS 인젝션 통로가 되므로, 태그별로 정확히 이
// 이름들만 허용한다(임의 style 속성은 아예 안 받고, 색상·크기·형광펜도 전부 이 화이트리스트
// 클래스 조합으로만 표현되게 함).
const ALLOWED_CLASSES = {
  div: ["callout"],
  span: [
    "fs-sm", "fs-lg", "fs-xl", "fs-reset",
    "tc-red", "tc-orange", "tc-yellow", "tc-green", "tc-blue", "tc-purple", "tc-gray", "tc-reset",
    "hl-yellow", "hl-green", "hl-blue", "hl-pink", "hl-gray", "hl-reset",
  ],
};

// 태그만 지우면 안 되고 내용째로 통째로 버려야 하는 것들 (원래도 실행은 안 되지만,
// 소스코드 텍스트가 본문에 그대로 노출되는 걸 막기 위함)
const STRIP_WITH_CONTENT = new Set(["script", "style", "template", "noscript", "iframe", "object", "embed"]);

function isSafeUrl(value, allowData) {
  const v = String(value == null ? "" : value).trim();
  if (!v) return false;
  if (/^https?:\/\//i.test(v)) return true;
  if (allowData && /^data:image\//i.test(v)) return true;
  return false; // javascript:, vbscript:, 상대경로, 그 외 스킴은 전부 거절
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function parseAttributes(raw) {
  const attrs = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(raw))) {
    const name = m[1].toLowerCase();
    const value = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : "";
    attrs[name] = value;
  }
  return attrs;
}

function serializeAttrs(name, parsed) {
  const allowedAttrNames = ALLOWED_TAGS[name];
  let out = "";
  allowedAttrNames.forEach((attrName) => {
    if (!(attrName in parsed)) return;
    const value = parsed[attrName];
    if (attrName === "class") {
      const allowed = ALLOWED_CLASSES[name] || [];
      const kept = value.split(/\s+/).filter((c) => allowed.indexOf(c) !== -1);
      if (kept.length) out += ' class="' + kept.join(" ") + '"';
      return;
    }
    if (attrName === "src" && name === "img") {
      if (!isSafeUrl(value, true)) return;
      out += ' src="' + escapeAttr(value) + '"';
      return;
    }
    if (attrName === "href" && name === "a") {
      if (!isSafeUrl(value, false)) return;
      out += ' href="' + escapeAttr(value) + '"';
      return;
    }
    out += " " + attrName + '="' + escapeAttr(value) + '"';
  });
  if (name === "a") out += ' target="_blank" rel="noopener noreferrer"';
  return out;
}

function sanitizeColumnBody(html) {
  const input = String(html == null ? "" : html).replace(/<!--[\s\S]*?-->/g, "");
  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
  const skipStack = []; // 통째로 버리는 중인 태그 이름 스택(script/style 등)
  let out = "";
  let lastIndex = 0;
  let match;

  while ((match = tagRe.exec(input))) {
    const full = match[0];
    const name = match[1].toLowerCase();
    const isClosing = full.charAt(1) === "/";
    const textBefore = input.slice(lastIndex, match.index);
    lastIndex = tagRe.lastIndex;

    if (skipStack.length) {
      if (isClosing && name === skipStack[skipStack.length - 1]) skipStack.pop();
      else if (!isClosing && STRIP_WITH_CONTENT.has(name)) skipStack.push(name);
      continue; // 버리는 구간 안에서는 텍스트도 태그도 전부 버림
    }

    out += textBefore;

    if (!isClosing && STRIP_WITH_CONTENT.has(name)) {
      skipStack.push(name);
      continue;
    }
    if (!(name in ALLOWED_TAGS)) continue; // 허용 안 된 태그는 지우고 텍스트만 남김(이미 위에서 붙임)

    if (isClosing) {
      out += "</" + name + ">";
      continue;
    }

    const selfClosing = /\/>$/.test(full);
    const attrsRaw = full.slice(1 + name.length, full.length - (selfClosing ? 2 : 1));
    const parsed = parseAttributes(attrsRaw);
    const attrOut = serializeAttrs(name, parsed);
    out += "<" + name + attrOut + (name === "img" || name === "br" ? " />" : ">");
  }
  out += skipStack.length ? "" : input.slice(lastIndex);
  return out.trim();
}

module.exports = { sanitizeColumnBody };
