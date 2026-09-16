/**
 * 칼럼 본문을 BlockNote(https://blocknotejs.org) 블록 JSON으로 저장하기 시작하면서
 * (2026-09-16, Tiptap 기반 커스텀 에디터를 BlockNote로 교체) 서버 쪽에서 필요한
 * 두 가지 순수 JS 유틸 — 실제 HTML 변환(blocksToHTMLLossy)은 BlockNote 라이브러리
 * 자체가 갖고 있고 브라우저에서만 동작하므로(ProseMirror가 DOM을 다뤄야 함),
 * Vercel 서버리스 함수(Node)에서는 그 변환을 하지 않는다 — 대신:
 *
 * 1) plainTextFromBlocks: og:description·글자수 계산용 순수 텍스트 추출 (HTML 불필요)
 * 2) sanitizeBlocknoteBlocks: 저장 전 구조 검증 + 위험한 URL 스킴(javascript: 등) 차단
 *    (로그인한 관리자만 이 값을 만들 수 있지만, 붙여넣기 등으로 실수로 위험한 링크가
 *    섞여 들어와도 로그인 없이 보는 공개 페이지로 그대로 나가지 않도록 방어)
 */

const SAFE_URL_RE = /^https?:\/\//i;
const SAFE_DATA_IMAGE_RE = /^data:image\//i;

function isSafeLinkUrl(url) {
  return typeof url === "string" && SAFE_URL_RE.test(url.trim());
}

function isSafeFileUrl(url) {
  const v = typeof url === "string" ? url.trim() : "";
  return SAFE_URL_RE.test(v) || SAFE_DATA_IMAGE_RE.test(v);
}

// BlockNote 기본 스키마(@blocknote/core defaultBlockSpecs)에 있는 블록 타입만 허용.
const ALLOWED_BLOCK_TYPES = new Set([
  "paragraph", "heading", "bulletListItem", "numberedListItem", "checkListItem",
  "toggleListItem", "quote", "codeBlock", "divider", "table",
  "image", "video", "audio", "file",
]);

const FILE_URL_PROP_TYPES = new Set(["image", "video", "audio", "file"]);

function sanitizeInlineContent(content) {
  if (!Array.isArray(content)) return [];
  const out = [];
  content.forEach((node) => {
    if (!node || typeof node !== "object") return;
    if (node.type === "text") {
      out.push({ type: "text", text: String(node.text || ""), styles: node.styles && typeof node.styles === "object" ? node.styles : {} });
      return;
    }
    if (node.type === "link") {
      const href = node.href;
      if (!isSafeLinkUrl(href)) {
        // 위험한 스킴이면 링크만 걷어내고 안의 글자는 일반 텍스트로 남긴다.
        (node.content || []).forEach((t) => {
          if (t && t.type === "text") out.push({ type: "text", text: String(t.text || ""), styles: t.styles && typeof t.styles === "object" ? t.styles : {} });
        });
        return;
      }
      out.push({
        type: "link",
        href: String(href),
        content: sanitizeInlineContent(node.content).filter((n) => n.type === "text"),
      });
      return;
    }
    // 알 수 없는 inline 타입은 버린다.
  });
  return out;
}

function sanitizeBlock(block) {
  if (!block || typeof block !== "object") return null;
  const type = block.type;
  if (typeof type !== "string" || !ALLOWED_BLOCK_TYPES.has(type)) return null;

  const props = block.props && typeof block.props === "object" ? { ...block.props } : {};
  if (FILE_URL_PROP_TYPES.has(type) && props.url && !isSafeFileUrl(props.url)) {
    props.url = "";
  }

  const sanitized = {
    id: typeof block.id === "string" ? block.id : undefined,
    type,
    props,
    content: Array.isArray(block.content) ? sanitizeInlineContent(block.content) : block.content,
    children: Array.isArray(block.children) ? block.children.map(sanitizeBlock).filter(Boolean) : [],
  };
  return sanitized;
}

/** 저장 직전 검증 + 정제. 형식이 아예 이상하면 null을 돌려준다(호출부에서 400 처리). */
function sanitizeBlocknoteBlocks(rawJson) {
  let blocks;
  try {
    blocks = JSON.parse(rawJson);
  } catch (e) {
    return null;
  }
  if (!Array.isArray(blocks)) return null;
  const cleaned = blocks.map(sanitizeBlock).filter(Boolean);
  return cleaned;
}

function inlineContentToText(content) {
  if (!Array.isArray(content)) return "";
  return content
    .map((node) => {
      if (!node || typeof node !== "object") return "";
      if (node.type === "text") return String(node.text || "");
      if (node.type === "link") return inlineContentToText(node.content);
      return "";
    })
    .join("");
}

function blockToText(block) {
  if (!block || typeof block !== "object") return "";
  const own = inlineContentToText(block.content);
  const childText = Array.isArray(block.children) ? block.children.map(blockToText).join(" ") : "";
  return [own, childText].filter(Boolean).join(" ");
}

/** og:description/글자수/읽는시간 계산용 — 서식 없는 순수 텍스트만 뽑는다. */
function plainTextFromBlocks(blocks) {
  if (!Array.isArray(blocks)) return "";
  return blocks.map(blockToText).filter(Boolean).join("\n\n");
}

module.exports = { sanitizeBlocknoteBlocks, plainTextFromBlocks };
