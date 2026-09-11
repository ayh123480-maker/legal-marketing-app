const { isAuthenticated } = require("../lib/auth");
const { parseBody } = require("../lib/parseBody");

/**
 * 재작성된 칼럼을 노션 페이지로 만들어줍니다.
 * 실제 Notion API 키는 서버 환경변수(NOTION_API_KEY) 안에만 존재하고,
 * 새 페이지는 NOTION_PARENT_PAGE_ID로 지정한 페이지 아래 하위 페이지로 생성됩니다.
 * body: { title: string, body: string, keyPoints?: string[], tags?: string[],
 *          extraSections?: [{ heading?: string, paragraphs?: string[], bullets?: string[] }] }
 *   extraSections는 본문 뒤에 구분선과 함께 추가로 덧붙는 섹션들 (예: 릴스 대본)
 * 응답: { url: string }  (생성된 노션 페이지 주소)
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
  if (!process.env.NOTION_API_KEY || !process.env.NOTION_PARENT_PAGE_ID) {
    res.status(500).json({ error: "서버에 NOTION_API_KEY / NOTION_PARENT_PAGE_ID 환경변수가 설정되지 않았어요." });
    return;
  }

  const body = await parseBody(req);
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
    res.status(200).json({ url: data.url });
  } catch (e) {
    res.status(500).json({ error: "노션 업로드 중 오류: " + e.message });
  }
};
