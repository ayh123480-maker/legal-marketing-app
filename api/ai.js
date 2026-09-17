const { isAuthenticated } = require("../lib/auth");
const { parseBody } = require("../lib/parseBody");

/**
 * 프론트엔드는 프롬프트만 보내고, 실제 Anthropic API 키는
 * 이 서버 함수(Vercel 환경변수 ANTHROPIC_API_KEY) 안에만 존재합니다.
 * body: { prompt: string, useWebSearch?: boolean, maxTokens?: number, images?: {mediaType, data}[] }
 *   - images는 base64 데이터(순수 base64, "data:...;base64," 접두어 제외)만 담아서 보냄 —
 *     레퍼런스 디자인 이미지를 분석시킬 때처럼 비전이 필요한 요청에서만 사용.
 * 응답: { text: string }  (모델이 낸 텍스트 블록을 이어붙인 것)
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
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: "서버에 ANTHROPIC_API_KEY 환경변수가 설정되지 않았어요." });
    return;
  }

  const body = await parseBody(req);
  const { prompt, useWebSearch, maxTokens, images } = body || {};
  if (!prompt) {
    res.status(400).json({ error: "prompt가 필요해요." });
    return;
  }
  if (images && images.length > 4) {
    res.status(400).json({ error: "이미지는 한 번에 4장까지만 보낼 수 있어요." });
    return;
  }

  const content =
    images && images.length
      ? [
          ...images.map((img) => ({
            type: "image",
            source: { type: "base64", media_type: img.mediaType, data: img.data },
          })),
          { type: "text", text: prompt },
        ]
      : prompt;

  const payload = {
    model: "claude-sonnet-4-6",
    max_tokens: maxTokens || 2000,
    messages: [{ role: "user", content }],
  };
  if (useWebSearch) {
    payload.tools = [{ type: "web_search_20250305", name: "web_search" }];
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      const msg = (data && data.error && data.error.message) || "Anthropic API 요청이 실패했어요.";
      // Anthropic이 401/403(예: ANTHROPIC_API_KEY 누락·오류·크레딧 문제)을 돌려줘도 그대로
      // 전달하면, 프론트엔드가 "이 앱 로그인이 만료됐다"로 오인해서 로그인 화면으로 튕겨버린다
      // (프론트는 모든 fetch에서 res.status===401을 "우리 앱 세션 만료"로만 해석함).
      // 실제 로그인 문제가 아니므로 502로 통일해서 내려주고, 원인 메시지는 그대로 보여준다.
      const status = response.status === 401 || response.status === 403 ? 502 : response.status;
      res.status(status).json({ error: msg });
      return;
    }
    const textBlocks = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    res.status(200).json({ text: textBlocks });
  } catch (e) {
    res.status(500).json({ error: "AI 호출 중 오류: " + e.message });
  }
};
