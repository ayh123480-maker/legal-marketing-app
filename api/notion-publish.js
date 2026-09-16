const { isAuthenticated } = require("../lib/auth");
const { parseBody } = require("../lib/parseBody");
const { sanitizeColumnBody } = require("../lib/sanitizeColumnBody");
const { fetchNotionPageAsHtml } = require("../lib/notionToHtml");
const { kv } = require("@vercel/kv");

/**
 * 노션 페이지(사용자가 노션 앱에서 직접 수정한 것)를 다시 읽어와서 예쁜 공개
 * 페이지(/c/:slug)로 발행(갱신)한다. api/publish-page.js와 저장 형식은
 * 같지만(record.bodyFormat = "html"), 본문 출처가 브라우저 입력이 아니라
 * 서버가 노션 API로 가져온 것이라는 점이 다르다 — 제목/본문은 노션 쪽이
 * 최신 기준이 되고, keyPoints/tags는 이 프로젝트에서 이미 저장돼 있던 값을
 * 그대로 유지한다(노션 페이지 구조에서 그 두 필드를 안정적으로 구분해낼
 * 방법이 없어서, 그건 여전히 이 앱 안에서 직접 관리하게 함).
 *
 * body: { slug: string, notionPageId: string, keyPoints?: string[], tags?: string[] }
 *   keyPoints/tags를 넘기면 그 값으로 덮어쓰고(최초 발행 시 재작성 결과에서 넘겨줌),
 *   생략하면 기존에 저장돼 있던 값을 그대로 유지한다("노션에서 새로고침"할 때는
 *   본문/제목만 갱신하고 이 두 필드는 건드리지 않기 위함).
 * 응답: { url: string, slug: string }
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

  const body = await parseBody(req);
  const { slug, notionPageId, keyPoints, tags } = body || {};
  if (!slug || !notionPageId) {
    res.status(400).json({ error: "slug와 notionPageId가 필요해요." });
    return;
  }

  const safeSlug = String(slug).replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeSlug) {
    res.status(400).json({ error: "슬러그가 올바르지 않아요." });
    return;
  }

  try {
    const { title, bodyHtml } = await fetchNotionPageAsHtml(String(notionPageId));
    if (!title || !bodyHtml) {
      res.status(400).json({ error: "노션 페이지에서 제목이나 본문을 읽어오지 못했어요. 페이지에 내용이 있는지 확인해주세요." });
      return;
    }

    const existing = (await kv.get(`pubpage:${safeSlug}`)) || {};
    const record = {
      title: String(title),
      body: sanitizeColumnBody(bodyHtml),
      bodyFormat: "html",
      keyPoints: Array.isArray(keyPoints)
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
};
