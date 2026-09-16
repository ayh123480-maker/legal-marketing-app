const { isAuthenticated } = require("../lib/auth");
const { parseBody } = require("../lib/parseBody");
const { sanitizeColumnBody } = require("../lib/sanitizeColumnBody");
const { sanitizeBlocknoteBlocks } = require("../lib/blocknoteBlocks");
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
 *
 * title/body 없이 slug + keyPoints/tags만 보내면 "메타만 수정" 모드로 동작한다
 * (예전엔 api/column-meta.js로 따로 있었는데, Vercel Hobby 플랜의 서버리스 함수
 * 12개 제한에 걸려서 2026-09-16에 여기로 합쳤다 — Hobby 플랜에서 함수 개수를
 * 아끼는 게 중요하니, 새 엔드포인트를 늘리기보다 기존 엔드포인트에 모드를
 * 추가하는 쪽을 우선 고려할 것). 이미 발행된 적 없는 slug면 404.
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
  const safeSlug = String(slug || "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeSlug) {
    res.status(400).json({ error: "슬러그가 올바르지 않아요." });
    return;
  }

  if (!title && !columnBody) {
    // 메타(핵심 포인트/태그)만 수정 — 제목·본문은 그대로 둔다.
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
      const proto = req.headers["x-forwarded-proto"] || "https";
      const origin = `${proto}://${req.headers.host}`;
      res.status(200).json({ url: `${origin}/c/${safeSlug}`, slug: safeSlug });
    } catch (e) {
      res.status(500).json({ error: "저장 중 오류: " + e.message });
    }
    return;
  }

  if (!title || !columnBody) {
    res.status(400).json({ error: "slug, title, body가 필요해요." });
    return;
  }

  // bodyFormat "blocknote-json"은 새 BlockNote 블록 에디터에서 온 블록 JSON —
  // 구조 검증 + 위험한 URL 스킴 차단(sanitizeBlocknoteBlocks)을 거쳐 정규화된
  // JSON 문자열로 저장한다.
  // "html"은 예전 Tiptap 에디터가 저장한 레거시 본문 — 로그인 없이도 열람 가능한
  // 공개 페이지에 그대로 꽂히므로 저장 전에 반드시 정제한다.
  // 그 외(기본값 "text")는 기존처럼 순수 텍스트로 저장해서 렌더링 시 escapeHtml을 그대로 탄다.
  const isBlockNoteJson = bodyFormat === "blocknote-json";
  const isHtml = bodyFormat === "html";

  let bodyToStore;
  let bodyFormatToStore;
  if (isBlockNoteJson) {
    const cleanedBlocks = sanitizeBlocknoteBlocks(String(columnBody));
    if (!cleanedBlocks) {
      res.status(400).json({ error: "본문 형식이 올바르지 않아요." });
      return;
    }
    bodyToStore = JSON.stringify(cleanedBlocks);
    bodyFormatToStore = "blocknote-json";
  } else if (isHtml) {
    bodyToStore = sanitizeColumnBody(String(columnBody));
    bodyFormatToStore = "html";
  } else {
    bodyToStore = String(columnBody);
    bodyFormatToStore = "text";
  }

  const record = {
    title: String(title),
    body: bodyToStore,
    bodyFormat: bodyFormatToStore,
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
