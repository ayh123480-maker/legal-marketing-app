const { isAuthenticated } = require("../lib/auth");
const { parseBody } = require("../lib/parseBody");

/**
 * 프론트엔드는 프롬프트만 보내고, 실제 Anthropic API 키는
 * 이 서버 함수(Vercel 환경변수 ANTHROPIC_API_KEY) 안에만 존재합니다.
 * body: { prompt: string, useWebSearch?: boolean, maxTokens?: number }
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
  const { prompt, useWebSearch, maxTokens } = body || {};
  if (!prompt) {
    res.status(400).json({ error: "prompt가 필요해요." });
    return;
  }

  const payload = {
    model: "claude-sonnet-4-6",
    max_tokens: maxTokens || 2000,
    messages: [{ role: "user", content: prompt }],
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
      res.status(response.status).json({ error: msg });
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
