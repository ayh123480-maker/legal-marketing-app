const { isAuthenticated } = require("../lib/auth");
const { isPublicHttpUrl } = require("../lib/isPublicHttpUrl");

const MAX_BYTES = 8 * 1024 * 1024; // 8MB

/**
 * 이미지 검색 결과(외부 도메인 URL)를 골랐을 때, 그 이미지를 서버에서 대신
 * fetch해서 data URL로 바꿔 돌려준다. 브라우저에서 직접 fetch하면 CORS 헤더가
 * 없는 이미지 호스트가 많아 실패하는 경우가 잦고(그래서 원래 클라이언트 쪽엔
 * 실패 시 원본 URL을 그대로 쓰는 폴백이 있었음), 사용자 네트워크에 따라 그
 * fetch 자체가 안 되는 경우도 있었다 — 서버에서 처리하면 두 문제 다 피한다.
 */
module.exports = async (req, res) => {
  if (!isAuthenticated(req)) {
    res.status(401).json({ error: "로그인이 필요해요." });
    return;
  }
  const url = req.query.url;
  if (!url || !isPublicHttpUrl(url)) {
    res.status(400).json({ error: "올바른 이미지 URL이 아니에요." });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) {
      res.status(502).json({ error: "이미지 응답 상태 " + response.status });
      return;
    }
    const contentType = (response.headers.get("content-type") || "").split(";")[0].trim();
    if (!contentType.startsWith("image/")) {
      res.status(415).json({ error: "이미지 파일이 아니에요." });
      return;
    }
    const buf = Buffer.from(await response.arrayBuffer());
    if (buf.length > MAX_BYTES) {
      res.status(413).json({ error: "이미지 용량이 너무 커요." });
      return;
    }
    res.status(200).json({ dataUrl: "data:" + contentType + ";base64," + buf.toString("base64") });
  } catch (e) {
    clearTimeout(timer);
    const reason = e.name === "AbortError" ? "응답 시간이 너무 오래 걸려요" : e.message;
    res.status(502).json({ error: reason });
  }
};
