const { isAuthenticated } = require("../lib/auth");
const { parseBody } = require("../lib/parseBody");
const { sanitizeColumnBody } = require("../lib/sanitizeColumnBody");
const { fetchNotionPageAsHtml } = require("../lib/notionToHtml");
const { kv } = require("@vercel/kv");

/**
 * 노션 연동 두 가지를 한 엔드포인트에서 처리한다(2026-09-16에 api/notion-publish.js를
 * 여기로 합침 — Vercel Hobby 플랜은 배포당 서버리스 함수가 12개까지만 되는데, 그때
 * 새 엔드포인트를 따로 만들었다가 배포가 통째로 실패했었다. 그래서 함수를 새로
 * 늘리기보다 관련 있는 기존 엔드포인트에 모드를 추가하는 쪽을 우선한다):
 *
 * 1) body에 notionPageId가 없으면: 재작성된 칼럼을 새 노션 페이지로 만든다.
 *    실제 Notion API 키는 서버 환경변수(NOTION_API_KEY) 안에만 존재하고,
 *    새 페이지는 NOTION_PARENT_PAGE_ID로 지정한 페이지 아래 하위 페이지로 생성된다.
 *    body: { title: string, body: string, subtitle?: string, keyPoints?: string[], tags?: string[],
 *             structured?: { introduction: string, sections: [{heading,paragraphs,bullets,callout}], conclusion: string },
 *             extraSections?: [{ heading?: string, paragraphs?: string[], bullets?: string[] }] }
 *      structured가 있으면(2026-09-16 칼럼 품질 개선 이후 생성된 결과) 소제목/목록/콜아웃으로
 *      매핑해서 올리고, 없으면(레거시 프로젝트 등) body를 문단 단위로만 분리해서 올린다(하위 호환).
 *      extraSections는 본문 뒤에 구분선과 함께 추가로 덧붙는 섹션들 (예: 릴스 대본)
 *    응답: { url: string, pageId: string, warning?: string }
 *      (warning은 블록이 너무 많아 일부 추가 요청이 실패해서 뒷부분이 안 올라갔을 때만 있음)
 *
 * 2) body에 notionPageId와 slug가 있으면: 그 노션 페이지(사용자가 노션 앱에서
 *    직접 수정한 것)를 다시 읽어와서 예쁜 공개 페이지(/c/:slug, 레거시 기능)로
 *    발행(갱신)한다. 제목/본문은 노션 쪽이 최신 기준이 되고, keyPoints/tags는
 *    slug로 저장돼있던 기존 값을 유지한다(단, 이 호출에 keyPoints/tags를 같이
 *    보내면 그 값으로 덮어씀 — 최초 발행 시 재작성 결과에서 넘겨줄 때 씀).
 *    body: { slug: string, notionPageId: string, keyPoints?: string[], tags?: string[] }
 *    응답: { url: string, slug: string }
 */

// 노션 rich_text 하나의 content는 2000자 제한 — 넘으면 여러 조각으로 쪼갠다
function richText(text) {
  const chunks = [];
  let s = String(text);
  do {
    chunks.push(s.slice(0, 2000));
    s = s.slice(2000);
  } while (s.length > 0);
  return chunks.map((c) => ({ type: "text", text: { content: c } }));
}

function paragraphBlock(text) {
  return { object: "block", type: "paragraph", paragraph: { rich_text: richText(text) } };
}
function bulletBlock(text) {
  return { object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: richText(text) } };
}
function headingBlock(level, text) {
  const type = "heading_" + level;
  return { object: "block", type, [type]: { rich_text: richText(text) } };
}
function calloutBlock(text) {
  return {
    object: "block", type: "callout",
    callout: { rich_text: richText(text), icon: { type: "emoji", emoji: "💡" } },
  };
}
function dividerBlock() {
  return { object: "block", divider: {}, type: "divider" };
}

function pushParagraphs(children, paragraphs) {
  (Array.isArray(paragraphs) ? paragraphs : []).forEach((p) => {
    const trimmed = String(p || "").trim();
    if (trimmed) children.push(paragraphBlock(trimmed));
  });
}
function pushBullets(children, bullets) {
  (Array.isArray(bullets) ? bullets : []).forEach((b) => {
    const trimmed = String(b || "").trim();
    if (trimmed) children.push(bulletBlock(trimmed));
  });
}

/**
 * 구조화된 칼럼 데이터를 노션 블록 목록으로 변환한다.
 * - subtitle/section.callout은 문서 전체에서 최대 2개까지만 실제 callout 블록으로
 *   만들고, 그 이상은 강조 표시 없는 일반 paragraph로 낮춘다(콜아웃 남발 방지).
 * - keyPoints는 heading_3 "핵심 포인트" + bulleted_list_item.
 * - sections[].heading -> heading_2, paragraphs -> paragraph, bullets -> bulleted_list_item.
 * - tags는 맨 아래 divider + paragraph로 정리.
 */
function buildStructuredChildren({ subtitle, keyPoints, structured, tags }) {
  const children = [];
  let calloutBudget = 2;
  const pushCallout = (text) => {
    const trimmed = String(text || "").trim();
    if (!trimmed) return;
    if (calloutBudget > 0) {
      children.push(calloutBlock(trimmed));
      calloutBudget -= 1;
    } else {
      children.push(paragraphBlock(trimmed));
    }
  };

  if (subtitle) pushCallout(subtitle);

  if (Array.isArray(keyPoints) && keyPoints.length) {
    children.push(headingBlock(3, "핵심 포인트"));
    pushBullets(children, keyPoints);
  }

  const introduction = (structured && structured.introduction) || "";
  String(introduction).split(/\n{2,}/).forEach((p) => {
    const trimmed = p.trim();
    if (trimmed) children.push(paragraphBlock(trimmed));
  });

  const sections = (structured && Array.isArray(structured.sections)) ? structured.sections : [];
  sections.forEach((section) => {
    if (!section) return;
    if (section.heading) children.push(headingBlock(2, section.heading));
    pushParagraphs(children, section.paragraphs);
    pushBullets(children, section.bullets);
    if (section.callout) pushCallout(section.callout);
  });

  const conclusion = (structured && structured.conclusion) || "";
  String(conclusion).split(/\n{2,}/).forEach((p) => {
    const trimmed = p.trim();
    if (trimmed) children.push(paragraphBlock(trimmed));
  });

  if (Array.isArray(tags) && tags.length) {
    children.push(dividerBlock());
    children.push(paragraphBlock(tags.map((t) => "#" + t).join("  ")));
  }

  return children;
}

/** 레거시(구조화 데이터 없음) 경로: 지금까지와 동일하게 body를 문단 단위로만 분리한다. */
function buildLegacyChildren({ keyPoints, columnBody, tags }) {
  const children = [];
  if (Array.isArray(keyPoints) && keyPoints.length) {
    children.push(headingBlock(3, "핵심 포인트"));
    pushBullets(children, keyPoints);
  }
  String(columnBody).split(/\n{2,}/).forEach((para) => {
    const trimmed = para.trim();
    if (trimmed) children.push(paragraphBlock(trimmed));
  });
  if (Array.isArray(tags) && tags.length) {
    children.push(paragraphBlock(tags.map((t) => "#" + t).join("  ")));
  }
  return children;
}

function buildExtraSectionChildren(extraSections) {
  const children = [];
  if (!Array.isArray(extraSections)) return children;
  extraSections.forEach((section) => {
    if (!section) return;
    const paragraphs = Array.isArray(section.paragraphs) ? section.paragraphs : [];
    const bullets = Array.isArray(section.bullets) ? section.bullets : [];
    if (!section.heading && !paragraphs.length && !bullets.length) return;
    children.push(dividerBlock());
    if (section.heading) children.push(headingBlock(2, section.heading));
    pushParagraphs(children, paragraphs);
    pushBullets(children, bullets);
  });
  return children;
}

/** 100개 초과 블록은 페이지 생성 후 children.append로 100개씩 나눠 이어붙인다
 *  (조용히 잘라내지 않고, 실패하면 어디까지 올라갔는지 알 수 있게 경고를 돌려준다). */
async function appendRemainingBlocks(pageId, remaining) {
  for (let i = 0; i < remaining.length; i += 100) {
    const chunk = remaining.slice(i, i + 100);
    const response = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify({ children: chunk }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const msg = (data && data.message) || "알 수 없는 오류";
      return `일부 내용은 노션 블록 제한 때문에 추가하지 못했어요 (${msg}). 페이지를 열어서 직접 이어 붙여주세요.`;
    }
  }
  return null;
}

module.exports = async (req, res) => {
  if (!isAuthenticated(req)) {
    res.status(401).json({ error: "로그인이 필요해요." });
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!process.env.NOTION_API_KEY) {
    res.status(500).json({ error: "서버에 NOTION_API_KEY 환경변수가 설정되지 않았어요." });
    return;
  }

  const body = await parseBody(req);

  if (body && body.notionPageId && body.slug) {
    await publishFromNotion(req, res, body);
    return;
  }

  if (!process.env.NOTION_PARENT_PAGE_ID) {
    res.status(500).json({ error: "서버에 NOTION_PARENT_PAGE_ID 환경변수가 설정되지 않았어요." });
    return;
  }

  const { title, body: columnBody, subtitle, keyPoints, tags, structured, extraSections } = body || {};
  if (!title || (!columnBody && !structured)) {
    res.status(400).json({ error: "title과 body가 필요해요." });
    return;
  }

  const children = structured
    ? buildStructuredChildren({ subtitle, keyPoints, structured, tags })
    : buildLegacyChildren({ keyPoints, columnBody: columnBody || "", tags });
  children.push(...buildExtraSectionChildren(extraSections));

  try {
    const response = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify({
        parent: { page_id: process.env.NOTION_PARENT_PAGE_ID },
        properties: { title: { title: richText(title) } },
        children: children.slice(0, 100), // 노션 페이지 생성 요청 자체는 블록 최대 100개까지만 허용
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      const msg = (data && data.message) || "Notion API 요청이 실패했어요.";
      // Notion이 401/403(예: NOTION_API_KEY 오류·권한 문제)을 돌려줘도 그대로 전달하면,
      // 프론트엔드가 이 앱의 "로그인 만료"로 오인해서 로그인 화면으로 튕겨버린다(프론트는
      // 모든 fetch에서 res.status===401을 우리 앱 세션 만료로만 해석함). 실제로는 우리 앱
      // 로그인과 무관하므로 502로 통일해서 내려주고, 원인 메시지는 그대로 보여준다.
      const status = response.status === 401 || response.status === 403 ? 502 : response.status;
      res.status(status).json({ error: msg });
      return;
    }

    let warning = null;
    if (children.length > 100) {
      // 100개 넘는 블록은 조용히 잘라내지 않고, 이어붙이기 요청으로 나눠서 전부 추가한다.
      warning = await appendRemainingBlocks(data.id, children.slice(100));
    }

    res.status(200).json({ url: data.url, pageId: data.id, warning });
  } catch (e) {
    res.status(500).json({ error: "노션 업로드 중 오류: " + e.message });
  }
};

async function publishFromNotion(req, res, body) {
  const { slug, notionPageId, keyPoints, tags } = body;
  const safeSlug = String(slug).replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeSlug) {
    res.status(400).json({ error: "슬러그가 올바르지 않아요." });
    return;
  }

  try {
    const notionResult = await fetchNotionPageAsHtml(String(notionPageId));
    const { title, bodyHtml } = notionResult;
    if (!title || !bodyHtml) {
      res.status(400).json({ error: "노션 페이지에서 제목이나 본문을 읽어오지 못했어요. 페이지에 내용이 있는지 확인해주세요." });
      return;
    }

    const existing = (await kv.get(`pubpage:${safeSlug}`)) || {};
    // 노션 본문 안에 "핵심 포인트" 섹션이 있으면 그게 최우선(사용자가 노션에서
    // 직접 다듬은 것) — 없으면 이 호출에 명시적으로 넘어온 값(최초 발행 시
    // 재작성 결과), 그것도 없으면 기존 저장 값을 유지.
    const record = {
      title: String(title),
      body: sanitizeColumnBody(bodyHtml),
      bodyFormat: "html",
      keyPoints: Array.isArray(notionResult.keyPoints)
        ? notionResult.keyPoints
        : Array.isArray(keyPoints)
        ? keyPoints.filter(Boolean).map(String)
        : Array.isArray(existing.keyPoints)
        ? existing.keyPoints
        : [],
      tags: Array.isArray(tags)
        ? tags.filter(Boolean).map(String)
        : Array.isArray(existing.tags)
        ? existing.tags
        : [],
      notionPageId: String(notionPageId),
      updatedAt: new Date().toISOString(),
    };

    await kv.set(`pubpage:${safeSlug}`, record);
    const proto = req.headers["x-forwarded-proto"] || "https";
    const origin = `${proto}://${req.headers.host}`;
    res.status(200).json({ url: `${origin}/c/${safeSlug}`, slug: safeSlug });
  } catch (e) {
    res.status(500).json({ error: "노션에서 가져오는 중 오류: " + e.message });
  }
}
