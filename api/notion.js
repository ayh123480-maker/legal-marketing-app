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
 *    body: { title: string, body: string, keyPoints?: string[], tags?: string[],
 *             extraSections?: [{ heading?: string, paragraphs?: string[], bullets?: string[] }] }
 *      extraSections는 본문 뒤에 구분선과 함께 추가로 덧붙는 섹션들 (예: 릴스 대본)
 *    응답: { url: string, pageId: string } (pageId는 아래 2번 호출에 씀)
 *
 * 2) body에 notionPageId와 slug가 있으면: 그 노션 페이지(사용자가 노션 앱에서
 *    직접 수정한 것)를 다시 읽어와서 예쁜 공개 페이지(/c/:slug)로 발행(갱신)한다.
 *    제목/본문은 노션 쪽이 최신 기준이 되고, keyPoints/tags는 slug로 저장돼있던
 *    기존 값을 유지한다(단, 이 호출에 keyPoints/tags를 같이 보내면 그 값으로
 *    덮어씀 — 최초 발행 시 재작성 결과에서 넘겨줄 때 씀).
 *    body: { slug: string, notionPageId: string, keyPoints?: string[], tags?: string[] }
 *    응답: { url: string, slug: string }
 */
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

  const { title, body: columnBody, keyPoints, tags, extraSections } = body || {};
  if (!title || !columnBody) {
    res.status(400).json({ error: "title과 body가 필요해요." });
    return;
  }

  // 노션 rich_text 하나의 content는 2000자 제한 — 넘으면 여러 조각으로 쪼갠다
  const richText = (text) => {
    const chunks = [];
    let s = String(text);
    do {
      chunks.push(s.slice(0, 2000));
      s = s.slice(2000);
    } while (s.length > 0);
    return chunks.map((c) => ({ type: "text", text: { content: c } }));
  };

  const children = [];
  if (Array.isArray(keyPoints) && keyPoints.length) {
    children.push({ object: "block", type: "heading_3", heading_3: { rich_text: richText("핵심 포인트") } });
    keyPoints.forEach((k) => {
      children.push({ object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: richText(k) } });
    });
  }

  String(columnBody).split(/\n{2,}/).forEach((para) => {
    const trimmed = para.trim();
    if (!trimmed) return;
    children.push({ object: "block", type: "paragraph", paragraph: { rich_text: richText(trimmed) } });
  });

  if (Array.isArray(tags) && tags.length) {
    children.push({
      object: "block", type: "paragraph",
      paragraph: { rich_text: richText(tags.map((t) => "#" + t).join("  ")) },
    });
  }

  if (Array.isArray(extraSections)) {
    extraSections.forEach((section) => {
      if (!section) return;
      const paragraphs = Array.isArray(section.paragraphs) ? section.paragraphs : [];
      const bullets = Array.isArray(section.bullets) ? section.bullets : [];
      if (!section.heading && !paragraphs.length && !bullets.length) return;
      children.push({ object: "block", type: "divider", divider: {} });
      if (section.heading) {
        children.push({ object: "block", type: "heading_2", heading_2: { rich_text: richText(section.heading) } });
      }
      paragraphs.forEach((p) => {
        const trimmed = String(p || "").trim();
        if (!trimmed) return;
        children.push({ object: "block", type: "paragraph", paragraph: { rich_text: richText(trimmed) } });
      });
      bullets.forEach((b) => {
        const trimmed = String(b || "").trim();
        if (!trimmed) return;
        children.push({ object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: richText(trimmed) } });
      });
    });
  }

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
        children: children.slice(0, 100), // 노션 페이지 생성 요청은 블록 최대 100개까지만 허용
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      const msg = (data && data.message) || "Notion API 요청이 실패했어요.";
      res.status(response.status).json({ error: msg });
      return;
    }
    res.status(200).json({ url: data.url, pageId: data.id });
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
