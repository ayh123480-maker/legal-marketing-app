const { isAuthenticated } = require("../lib/auth");
const { parseBody } = require("../lib/parseBody");
const { kv } = require("@vercel/kv");

/**
 * 팀 전체가 같은 비밀번호를 쓰는 단일 테넌트 구조라서
 * personal/shared 구분 없이 하나의 키-값 저장소를 그대로 씁니다.
 *
 * GET    /api/storage?key=xxx            → { key, value }
 * GET    /api/storage?list=1&prefix=xxx  → { keys: [...] }
 * POST   /api/storage  { key, value }    → upsert
 * DELETE /api/storage?key=xxx            → 삭제
 */
module.exports = async (req, res) => {
  if (!isAuthenticated(req)) {
    res.status(401).json({ error: "로그인이 필요해요." });
    return;
  }

  try {
    if (req.method === "GET") {
      if (req.query.list) {
        const prefix = req.query.prefix || "";
        const keys = await kv.keys(prefix + "*");
        res.status(200).json({ keys });
        return;
      }
      const key = req.query.key;
      if (!key) {
        res.status(400).json({ error: "key가 필요해요." });
        return;
      }
      const value = await kv.get(key);
      if (value === null || value === undefined) {
        res.status(404).json({ error: "not found" });
        return;
      }
      res.status(200).json({ key, value });
      return;
    }

    if (req.method === "POST") {
      const body = await parseBody(req);
      const { key, value } = body || {};
      if (!key) {
        res.status(400).json({ error: "key가 필요해요." });
        return;
      }
      await kv.set(key, value);
      res.status(200).json({ key, value });
      return;
    }

    if (req.method === "DELETE") {
      const key = req.query.key;
      if (!key) {
        res.status(400).json({ error: "key가 필요해요." });
        return;
      }
      await kv.del(key);
      res.status(200).json({ key, deleted: true });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    res.status(500).json({ error: "저장소 오류: " + e.message });
  }
};
