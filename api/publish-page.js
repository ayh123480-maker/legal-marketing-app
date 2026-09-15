const { isAuthenticated } = require("../lib/auth");
const { parseBody } = require("../lib/parseBody");
const { sanitizeColumnBody } = require("../lib/sanitizeColumnBody");
const { kv } = require("@vercel/kv");

/**
 * 재작성된 칼럼을 "예쁜 공개 페이지"로 발행(저장)한다.
 * 실제 렌더링은 api/p/[slug].js가 로그인 없이 공개로 처리한다 — 여기는 저장만.
 *
 * 같은 slug(=칼럼 프로젝트 id)로 다시 발행하면 기존 페이지 내용을 덮어쓴다.
 * 즉 앱에서 칼럼 제목·본문을 고쳐서 다시 "예쁜 페이지로 발행"을 누르면
 * 같은 링크가 최신 내용으로 갱신된다 (별도의 페이지 내 편집 UI는 없음).
 *
 * body: { slug: string, title: string, body: string, keyPoints?: string[], tags?: string[] }
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
  const { slug, title, body: columnBody, keyPoints, tags, bodyFormat } = body || {};
  if (!slug || !title || !columnBody) {
    res.status(400).json({ error: "slug, title, body가 필요해요." });
    return;
  }

  const safeSlug = String(slug).replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeSlug) {
    res.status(400).json({ error: "슬러그가 올바르지 않아요." });
    return;
  }

  // bodyFormat "html"은 발행된 페이지의 전체화면 리치 에디터(굵게/소제목/콜아웃/이미지)에서 온
  // 본문 — 로그인 없이도 열람 가능한 공개 페이지에 그대로 꽂히므로 저장 전에 반드시 정제한다.
  // 그 외(기본값 "text")는 기존처럼 순수 텍스트로 저장해서 렌더링 시 escapeHtml을 그대로 탄다.
  const isHtml = bodyFormat === "html";
  const record = {
    title: String(title),
    body: isHtml ? sanitizeColumnBody(String(columnBody)) : String(columnBody),
    bodyFormat: isHtml ? "html" : "text",
    keyPoints: Array.isArray(keyPoints) ? keyPoints.filter(Boolean).map(String) : [],
    tags: Array.isArray(tags) ? tags.filter(Boolean).map(String) : [],
    updatedAt: new Date().toISOString(),
  };

  try {
    await kv.set(`pubpage:${safeSlug}`, record);
    const proto = req.headers["x-forwarded-proto"] || "https";
    const origin = `${proto}://${req.headers.host}`;
    res.status(200).json({ url: `${origin}/c/${safeSlug}`, slug: safeSlug });
  } catch (e) {
    res.status(500).json({ error: "페이지 저장 중 오류: " + e.message });
  }
};
