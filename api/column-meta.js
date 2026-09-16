const { isAuthenticated } = require("../lib/auth");
const { parseBody } = require("../lib/parseBody");
const { kv } = require("@vercel/kv");

/**
 * 발행된 칼럼 페이지의 "핵심 포인트"·"태그"만 수정한다(제목·본문은 노션 페이지
 * 또는 마케팅 툴 앱의 재작성 흐름에서만 바뀜 — lib/renderColumnPage.js의 편집
 * 모달 주석 참고). 레코드가 이미 있어야 하고(발행된 적 없는 슬러그는 400),
 * title/body/bodyFormat 등 다른 필드는 그대로 둔다.
 *
 * body: { slug: string, keyPoints?: string[], tags?: string[] }
 * 응답: { ok: true }
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
  const { slug, keyPoints, tags } = body || {};
  const safeSlug = String(slug || "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeSlug) {
    res.status(400).json({ error: "슬러그가 올바르지 않아요." });
    return;
  }

  try {
    const existing = await kv.get(`pubpage:${safeSlug}`);
    if (!existing) {
      res.status(404).json({ error: "발행된 페이지를 찾을 수 없어요." });
      return;
    }
    const record = {
      ...existing,
      keyPoints: Array.isArray(keyPoints) ? keyPoints.filter(Boolean).map(String) : existing.keyPoints || [],
      tags: Array.isArray(tags) ? tags.filter(Boolean).map(String) : existing.tags || [],
      updatedAt: new Date().toISOString(),
    };
    await kv.set(`pubpage:${safeSlug}`, record);
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "저장 중 오류: " + e.message });
  }
};
