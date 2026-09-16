/**
 * 노션 페이지(사용자가 직접 편집한 것)를 이 프로젝트의 공개 칼럼 페이지 HTML로
 * 변환한다. 2026-09-16 — 직접 만든 리치 에디터(Tiptap → BlockNote로 두 번
 * 갈아엎었지만 둘 다 CDN·번들러 문제로 계속 고생함, CLAUDE.md 참고)를 포기하고,
 * "글은 노션 앱에서 직접 쓰고, 우리 서버는 그 결과만 예쁘게 렌더링"하는 방식으로
 * 바꾼 것 — Vercel 서버리스 함수(Node)에서 노션 REST API만 호출하면 돼서
 * 브라우저 CDN 관련 문제가 구조적으로 아예 없다.
 *
 * 변환 결과 HTML은 반드시 sanitizeColumnBody()를 거쳐서 저장/렌더링해야 한다
 * (여기서는 구조 변환만 하고 보안 정제는 하지 않음 — sanitizeColumnBody의 허용
 * 태그/클래스 목록에 맞춰 구조를 만들 뿐).
 *
 * 지원하는 노션 블록: paragraph, heading_1/2/3, bulleted_list_item,
 * numbered_list_item, to_do(체크리스트), toggle(접기/펼치기), quote, callout,
 * divider, image, code. 지원하지 않는 블록(테이블, 임베드, 데이터베이스, 동기화
 * 블록 등)은 조용히 건너뛴다 — 완벽한 노션 클론이 아니라 "텍스트·이미지·기본
 * 서식" 위주의 칼럼 콘텐츠가 목적이라 이 정도로 충분하다고 봄.
 *
 * "핵심 포인트" 제목(heading) + 그 바로 아래 글머리 목록은 특별 취급한다 —
 * api/notion.js가 페이지를 처음 만들 때 이 모양으로 적어두는데, 다시 읽어올
 * 때 이 구간을 알아보고 keyPoints 배열로 뽑아서 본문에서는 빼준다(그래야
 * 사용자가 "핵심 포인트" 박스 내용을 노션에서 직접 고칠 수 있고, 본문에
 * 중복으로 안 나온다). extractKeyPointsSection() 참고.
 */

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
const MAX_BLOCKS = 600; // 안전장치 — 비정상적으로 큰 페이지에서 무한정 재귀하지 않게
const MAX_DEPTH = 4; // 중첩 목록/토글 등 자식 블록 재귀 깊이 제한
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function notionHeaders() {
  return {
    Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
    "Notion-Version": NOTION_VERSION,
  };
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s) {
  return escapeHtml(s);
}

// 노션 텍스트 색상 → 이 프로젝트가 이미 쓰던 tc-*/hl-* 클래스(sanitizeColumnBody 허용 목록)
const TEXT_COLOR_CLASS = {
  red: "tc-red", orange: "tc-orange", yellow: "tc-yellow", green: "tc-green",
  blue: "tc-blue", purple: "tc-purple", gray: "tc-gray", default: null,
};
const BG_COLOR_CLASS = {
  yellow_background: "hl-yellow", green_background: "hl-green", blue_background: "hl-blue",
  pink_background: "hl-pink", gray_background: "hl-gray",
};

function richTextToHtml(richTextArray) {
  if (!Array.isArray(richTextArray)) return "";
  return richTextArray
    .map((rt) => {
      const text = escapeHtml(rt.plain_text || "");
      if (!text) return "";
      const ann = rt.annotations || {};
      let out = text.replace(/\n/g, "<br />");
      if (ann.code) out = `<code>${out}</code>`;
      if (ann.bold) out = `<strong>${out}</strong>`;
      if (ann.italic) out = `<em>${out}</em>`;
      if (ann.underline) out = `<u>${out}</u>`;
      if (ann.strikethrough) out = `<s>${out}</s>`;
      const colorClass = TEXT_COLOR_CLASS[ann.color] || BG_COLOR_CLASS[ann.color];
      if (colorClass) out = `<span class="${colorClass}">${out}</span>`;
      const href = rt.href;
      if (href && /^https?:\/\//i.test(href)) {
        out = `<a href="${escapeAttr(href)}">${out}</a>`;
      }
      return out;
    })
    .join("");
}

function richTextToPlain(richTextArray) {
  if (!Array.isArray(richTextArray)) return "";
  return richTextArray.map((rt) => rt.plain_text || "").join("");
}

async function notionFetch(path, options) {
  const res = await fetch(`${NOTION_API_BASE}${path}`, {
    ...options,
    headers: { ...notionHeaders(), ...(options && options.headers) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data && data.message) || `노션 API 오류(${res.status})`;
    throw new Error(msg);
  }
  return data;
}

async function fetchAllChildren(blockId, depth) {
  const results = [];
  let cursor;
  do {
    const qs = new URLSearchParams({ page_size: "100" });
    if (cursor) qs.set("start_cursor", cursor);
    const data = await notionFetch(`/blocks/${blockId}/children?${qs.toString()}`);
    results.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor && results.length < MAX_BLOCKS);

  if (depth < MAX_DEPTH) {
    for (const block of results) {
      if (block.has_children) {
        block.__children = await fetchAllChildren(block.id, depth + 1);
      }
    }
  }
  return results;
}

/** 노션의 file(=업로드) 이미지는 임시 서명 URL(보통 1시간 만료)이라, 지금 바로
 * fetch해서 data URL로 바꿔 영구 저장한다. external(외부 URL) 이미지는 그대로 둔다. */
async function resolveImageSrc(imageBlock) {
  const img = imageBlock.image || {};
  if (img.type === "external") {
    const url = img.external && img.external.url;
    return /^https?:\/\//i.test(url || "") ? url : null;
  }
  if (img.type === "file") {
    const url = img.file && img.file.url;
    if (!url) return null;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return null;
      const contentType = (res.headers.get("content-type") || "image/png").split(";")[0].trim();
      if (!contentType.startsWith("image/")) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_IMAGE_BYTES) return null;
      return `data:${contentType};base64,${buf.toString("base64")}`;
    } catch (e) {
      return null;
    }
  }
  return null;
}

/** 연속된 bulleted_list_item/numbered_list_item/to_do를 하나의 ul/ol로 묶어서
 * 렌더링해야 하므로, 블록을 순회하며 HTML을 만드는 메인 루프. */
async function blocksToHtml(blocks) {
  const parts = [];
  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    const type = block.type;

    if (type === "bulleted_list_item" || type === "numbered_list_item") {
      const tag = type === "bulleted_list_item" ? "ul" : "ol";
      const items = [];
      while (i < blocks.length && blocks[i].type === type) {
        const b = blocks[i];
        let itemHtml = richTextToHtml(b[type].rich_text);
        if (b.__children && b.__children.length) {
          itemHtml += await blocksToHtml(b.__children);
        }
        items.push(`<li>${itemHtml}</li>`);
        i++;
      }
      parts.push(`<${tag}>${items.join("")}</${tag}>`);
      continue;
    }

    if (type === "to_do") {
      const items = [];
      while (i < blocks.length && blocks[i].type === "to_do") {
        const b = blocks[i];
        const checked = !!b.to_do.checked;
        items.push(
          `<li data-type="taskItem" data-checked="${checked}"><label><input type="checkbox" ${checked ? "checked" : ""} /></label><div><p>${richTextToHtml(b.to_do.rich_text)}</p></div></li>`
        );
        i++;
      }
      parts.push(`<ul data-type="taskList">${items.join("")}</ul>`);
      continue;
    }

    // 그 외 블록 타입은 한 번에 하나씩 처리
    i++;
    if (type === "paragraph") {
      const html = richTextToHtml(block.paragraph.rich_text);
      if (html) parts.push(`<p>${html}</p>`);
      continue;
    }
    if (type === "heading_1") {
      parts.push(`<h2>${richTextToHtml(block.heading_1.rich_text)}</h2>`);
      continue;
    }
    if (type === "heading_2") {
      parts.push(`<h3>${richTextToHtml(block.heading_2.rich_text)}</h3>`);
      continue;
    }
    if (type === "heading_3") {
      parts.push(`<h4>${richTextToHtml(block.heading_3.rich_text)}</h4>`);
      continue;
    }
    if (type === "quote") {
      let html = `<p>${richTextToHtml(block.quote.rich_text)}</p>`;
      if (block.__children && block.__children.length) html += await blocksToHtml(block.__children);
      parts.push(`<blockquote>${html}</blockquote>`);
      continue;
    }
    if (type === "callout") {
      const icon = block.callout.icon;
      const emoji = icon && icon.type === "emoji" ? icon.emoji : "💡";
      let html = `<p>${richTextToHtml(block.callout.rich_text)}</p>`;
      if (block.__children && block.__children.length) html += await blocksToHtml(block.__children);
      parts.push(
        `<div class="callout"><span class="callout-emoji">${escapeHtml(emoji)}</span><div class="callout-content">${html}</div></div>`
      );
      continue;
    }
    if (type === "divider") {
      parts.push("<hr />");
      continue;
    }
    if (type === "code") {
      const text = richTextToPlain(block.code.rich_text);
      const lang = String(block.code.language || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
      parts.push(`<pre><code${lang ? ` class="language-${lang}"` : ""}>${escapeHtml(text)}</code></pre>`);
      continue;
    }
    if (type === "image") {
      const src = await resolveImageSrc(block);
      if (src) {
        const caption = richTextToPlain(block.image.caption);
        parts.push(`<img src="${escapeAttr(src)}" alt="${escapeAttr(caption)}" />`);
      }
      continue;
    }
    if (type === "toggle") {
      // 열람 페이지에도 진짜 접기/펼치기 UI가 있다(lib/renderColumnPage.js의
      // div[data-type="toggle"] 스타일 + 클릭 핸들러 — 예전 레거시 에디터 때부터
      // 있던 구조를 그대로 재사용).
      let contentHtml = "";
      if (block.__children && block.__children.length) contentHtml = await blocksToHtml(block.__children);
      parts.push(
        `<div data-type="toggle"><summary>${richTextToHtml(block.toggle.rich_text)}</summary><div data-type="toggle-content">${contentHtml}</div></div>`
      );
      continue;
    }
    // 표·임베드·데이터베이스·동기화 블록 등은 지원 범위 밖이라 건너뜀
  }
  return parts.join("\n");
}

const HEADING_TYPES = new Set(["heading_1", "heading_2", "heading_3"]);
const KEY_POINTS_HEADING_TEXT = "핵심 포인트";

/**
 * api/notion.js가 노션 페이지를 처음 만들 때 "핵심 포인트" 제목(heading) 바로
 * 뒤에 글머리 목록으로 핵심 포인트를 적어둔다. 사용자가 노션에서 그 목록을
 * 직접 고칠 수 있게 하려면, 다시 읽어올 때 그 구간을 알아보고 keyPoints
 * 배열로 뽑아낸 뒤 본문에서는 빼야 한다(안 그러면 위쪽 체크리스트 박스랑
 * 본문에 두 번 나옴). 그 헤딩을 못 찾으면 그냥 null을 돌려주고, 호출부가
 * 이 앱에 이미 저장돼 있던 값(또는 직접 입력한 값)을 쓰게 한다.
 */
function extractKeyPointsSection(blocks) {
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (!HEADING_TYPES.has(b.type)) continue;
    const text = richTextToPlain(b[b.type].rich_text).trim();
    if (text !== KEY_POINTS_HEADING_TEXT) continue;

    let j = i + 1;
    const items = [];
    while (j < blocks.length && blocks[j].type === "bulleted_list_item") {
      const item = richTextToPlain(blocks[j].bulleted_list_item.rich_text).trim();
      if (item) items.push(item);
      j++;
    }
    if (!items.length) continue;
    return { keyPoints: items, start: i, end: j }; // [start, end) 구간을 본문에서 제외
  }
  return null;
}

/**
 * @param {string} pageId - 노션 페이지 ID(UUID)
 * @returns {Promise<{title: string, bodyHtml: string, keyPoints: string[] | null}>}
 *   keyPoints는 노션 본문에서 "핵심 포인트" 섹션을 찾았을 때만 배열, 못 찾으면 null
 *   (null이면 호출부가 기존/수동 입력 값을 그대로 쓰면 됨).
 */
async function fetchNotionPageAsHtml(pageId) {
  if (!process.env.NOTION_API_KEY) {
    throw new Error("서버에 NOTION_API_KEY 환경변수가 설정되지 않았어요.");
  }
  const page = await notionFetch(`/pages/${pageId}`);
  const titleProp = Object.values(page.properties || {}).find((p) => p.type === "title");
  const title = titleProp ? richTextToPlain(titleProp.title) : "";

  const blocks = await fetchAllChildren(pageId, 0);

  const keyPointsSection = extractKeyPointsSection(blocks);
  const bodyBlocks = keyPointsSection
    ? blocks.slice(0, keyPointsSection.start).concat(blocks.slice(keyPointsSection.end))
    : blocks;

  const bodyHtml = await blocksToHtml(bodyBlocks);
  return { title, bodyHtml, keyPoints: keyPointsSection ? keyPointsSection.keyPoints : null };
}

module.exports = { fetchNotionPageAsHtml };
