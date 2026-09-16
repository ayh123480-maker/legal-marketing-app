/**
 * 칼럼 본문 리치 에디터에서 저장/조회되는 HTML을 정제한다. 이 HTML은 로그인 없이
 * 열람 가능한 공개 페이지(api/p/[slug].js)에 그대로 삽입되므로, 저장 시
 * (api/publish-page.js)와 렌더 시(lib/renderColumnPage.js) 두 지점에서 모두 이
 * 함수를 거치게 해서 스크립트·이벤트 핸들러 등이 섞여 들어가지 않게 막는다.
 *
 * 원래 sanitize-html 패키지로 구현했었는데, Vercel 서버리스 함수가 그 패키지(와 딸려오는
 * 하위 의존성들)를 제대로 번들링하지 못해서 api/p/[slug].js가 require 시점에 죽어버리는
 * 문제가 있었다(2026-09-15). 그래서 외부 패키지 없이 직접 구현함.
 *
 * 2026-09-16에 에디터를 직접 만든 contenteditable에서 Tiptap(ProseMirror) 기반
 * 노션풍 블록 에디터로 바꾸면서, 허용 태그를 pre/code/mark/hr/label/input/summary/
 * toggle 구조까지 넓혔다(각 확장의 실제 renderHTML 출력을 npm에서 직접 받아 확인
 * 하고 그 형태에 맞춤 — @tiptap/extension-task-item, task-list, highlight).
 * 기존에 저장된 레거시 레코드(굵게/제목/콜아웃/fs-*·tc-*·hl-* 클래스)도 계속
 * 렌더링해야 해서 예전 허용 목록은 전부 그대로 남겨뒀다.
 *
 * 2026-09-16에 칼럼 작성을 노션 연동(lib/notionToHtml.js가 노션 페이지를 이
 * HTML로 변환) 방식으로 바꾸면서, 콜아웃의 내용 div("callout-content")와
 * 이모지 span("callout-emoji")도 허용 목록에 추가함 — 원래도 콜아웃 CSS가
 * 이 클래스들을 전제로 하고 있었는데(lib/renderColumnPage.js의 .callout-content
 * p{margin:0} 등) 정작 허용 목록엔 없어서 실제로는 항상 잘려나가고 있었다.
 *

 * 태그/속성 이름을 정규식으로 잘라내되, 출력은 항상 "허용된 속성 이름 → 검증된 값"만
 * 가지고 새로 조립한다(입력 문자열의 속성 구간을 그대로 베껴 쓰지 않음). 그래서 태그
 * 경계를 잘못 잘라내는 경우가 있어도(예: 속성값 안에 '>'가 섞여 있는 극단적인 입력)
 * 최악의 결과는 내용이 일부 사라지는 것이지, 허용 안 된 태그·속성이 그대로 새어나가는
 * 것은 아니다.
 */

// 태그 이름 → 허용 속성 이름 목록
const ALLOWED_TAGS = {
  p: [], br: [], strong: [], b: [], em: [], i: [], u: [], s: [], code: ["class"],
  h2: [], h3: [], h4: [], ul: ["data-type"], ol: [], li: ["data-type", "data-checked"],
  blockquote: [],
  div: ["class", "data-type"],
  span: ["class", "style"],
  mark: ["style"],
  img: ["src", "alt"],
  a: ["href"],
  pre: [],
  hr: [],
  label: [],
  input: ["type", "checked"],
  summary: [],
};

const VOID_TAGS = new Set(["img", "br", "hr", "input"]);

// class 속성은 자유 문자열을 허용하면 CSS 인젝션 통로가 되므로, 태그별로 정확히 이
// 이름들만 허용한다(임의 style은 아래 sanitizeSpanStyle을 통과한 값만, 그마저도
// font-size/color/background-color 세 속성 + hex 색상값 정도로만 좁혀서 받는다).
const ALLOWED_CLASSES = {
  div: ["callout", "callout-content"],
  code: [], // language-* 는 아래에서 패턴으로 별도 검증(정해진 이름 목록이 아니라서)
  span: [
    "fs-sm", "fs-lg", "fs-xl", "fs-reset",
    "tc-red", "tc-orange", "tc-yellow", "tc-green", "tc-blue", "tc-purple", "tc-gray", "tc-reset",
    "hl-yellow", "hl-green", "hl-blue", "hl-pink", "hl-gray", "hl-reset",
    "callout-emoji",
  ],
};

// data-* 속성은 값 자체가 자유 문자열이면 안 되니, 태그별로 허용하는 값의 집합을 정해둔다.
const ALLOWED_DATA_ATTR_VALUES = {
  "div:data-type": ["toggle", "toggle-content"],
  "ul:data-type": ["taskList"],
  "li:data-type": ["taskItem"],
  "li:data-checked": ["true", "false"],
};

// 태그만 지우면 안 되고 내용째로 통째로 버려야 하는 것들 (원래도 실행은 안 되지만,
// 소스코드 텍스트가 본문에 그대로 노출되는 걸 막기 위함)
const STRIP_WITH_CONTENT = new Set(["script", "style", "template", "noscript", "iframe", "object", "embed"]);

const HEX_COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

// span/mark의 style 속성: font-size(8~96px로 clamp) / color / background-color만
// 개별적으로 검증해서 통과분만 재조립한다. 그 외 어떤 CSS 속성·함수(url(), calc(),
// javascript: 등)도 그대로는 못 들어간다 — 값이 순수 hex 색상이 아니면 그 프로퍼티만
//버려진다(전체 style을 몽땅 버리지 않고 프로퍼티 단위로 걸러서, 예를 들어 Tiptap
// Highlight가 함께 내보내는 "color: inherit" 같은 무해하지만 화이트리스트 밖인 값도
// 조용히 빠지고 나머지(background-color)는 살아남는다).
function sanitizeSpanStyle(value) {
  const raw = String(value == null ? "" : value);
  const kept = [];
  raw.split(";").forEach((part) => {
    const m = /^\s*([a-z-]+)\s*:\s*(.+?)\s*$/i.exec(part);
    if (!m) return;
    const prop = m[1].toLowerCase();
    const val = m[2].trim();
    if (prop === "font-size") {
      const sizeMatch = /^(\d{1,3})px$/i.exec(val);
      if (sizeMatch) {
        const n = Math.max(8, Math.min(96, parseInt(sizeMatch[1], 10) || 0));
        kept.push("font-size:" + n + "px");
      }
    } else if ((prop === "color" || prop === "background-color") && HEX_COLOR_RE.test(val)) {
      kept.push(prop + ":" + val.toLowerCase());
    }
  });
  return kept.length ? kept.join("; ") + ";" : null;
}

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
  // <input>은 화이트리스트 밖 속성이 섞여 들어올 여지를 아예 안 주려고 통째로
  // 새로 만든다 — 체크박스로만 쓰이고, 열람 페이지에서는 항상 disabled로 고정
  // (읽기 전용 페이지에서 진짜로 체크 상태가 바뀌는 것처럼 보이면 안 되니까).
  if (name === "input") {
    const checked = "checked" in parsed;
    return ' type="checkbox" disabled' + (checked ? " checked" : "");
  }

  const allowedAttrNames = ALLOWED_TAGS[name];
  let out = "";
  allowedAttrNames.forEach((attrName) => {
    if (!(attrName in parsed)) return;
    const value = parsed[attrName];

    if (attrName === "class") {
      const allowed = ALLOWED_CLASSES[name] || [];
      const kept = value.split(/\s+/).filter((c) => allowed.indexOf(c) !== -1);
      // code 블록의 language-* 클래스만 별도 패턴으로 허용(정해진 이름 목록이 아니라서)
      if (name === "code") {
        value.split(/\s+/).forEach((c) => {
          if (/^language-[a-z0-9]*$/i.test(c)) kept.push(c);
        });
      }
      if (kept.length) out += ' class="' + kept.join(" ") + '"';
      return;
    }
    if (attrName === "data-type" || attrName === "data-checked") {
      const allowedValues = ALLOWED_DATA_ATTR_VALUES[name + ":" + attrName];
      if (allowedValues && allowedValues.indexOf(value) !== -1) {
        out += " " + attrName + '="' + value + '"';
      }
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
    if (attrName === "style" && (name === "span" || name === "mark")) {
      const safeStyle = sanitizeSpanStyle(value);
      if (safeStyle) out += ' style="' + safeStyle + '"';
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
      if (!VOID_TAGS.has(name)) out += "</" + name + ">";
      continue;
    }

    const selfClosing = /\/>$/.test(full);
    const attrsRaw = full.slice(1 + name.length, full.length - (selfClosing ? 2 : 1));
    const parsed = parseAttributes(attrsRaw);
    const attrOut = serializeAttrs(name, parsed);
    out += "<" + name + attrOut + (VOID_TAGS.has(name) ? " />" : ">");
  }
  out += skipStack.length ? "" : input.slice(lastIndex);
  return out.trim();
}

module.exports = { sanitizeColumnBody };
