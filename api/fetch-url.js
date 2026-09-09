const { isAuthenticated } = require("../lib/auth");

/**
 * 아주 단순한 HTML → 텍스트 변환기 (별도 라이브러리 없이 정규식으로 처리).
 * 뉴스/블로그류 페이지에서 본문을 뽑아내는 용도라 완벽하진 않지만,
 * "웹서치로 대충 추측"하는 것보다 훨씬 원문에 충실하다.
 */
function stripHtml(html) {
  let text = html;
  text = text.replace(/<script[\s\S]*?<\/script>/gi, " ");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, " ");
  text = text.replace(/<!--([\s\S]*?)-->/g, " ");

  // <article> 태그가 있으면 그 안쪽만 우선 사용 (본문일 확률이 높음)
  const articleMatch = text.match(/<article[\s\S]*?<\/article>/i);
  if (articleMatch && articleMatch[0].length > 300) {
    text = articleMatch[0];
  }

  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/p>/gi, "\n\n");
  text = text.replace(/<\/div>/gi, "\n");
  text = text.replace(/<[^>]+>/g, " ");

  text = text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'");

  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.replace(/^[ \t]+|[ \t]+$/gm, "");
  return text.trim();
}

module.exports = async (req, res) => {
  if (!isAuthenticated(req)) {
    res.status(401).json({ error: "로그인이 필요해요." });
    return;
  }
  const url = req.query.url;
  if (!url) {
    res.status(400).json({ error: "url이 필요해요." });
    return;
  }
  let parsed;
  try {
    parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("invalid protocol");
  } catch (e) {
    res.status(400).json({ error: "올바른 URL 형식이 아니에요." });
    return;
  }

  try {
    const response = await fetch(parsed.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
      },
      redirect: "follow",
    });
    if (!response.ok) {
      res.status(502).json({
        error: `원본 페이지를 가져오지 못했어요 (상태 코드 ${response.status}). 사이트가 자동 접근을 막고 있을 수 있어요. 텍스트를 직접 붙여넣어 주세요.`,
      });
      return;
    }
    const html = await response.text();
    const text = stripHtml(html);
    if (text.length < 200) {
      res.status(422).json({
        error: "페이지에서 본문을 충분히 추출하지 못했어요 (로그인 필요 페이지이거나 구조가 특이할 수 있어요). 텍스트를 직접 붙여넣어 주세요.",
      });
      return;
    }
    const trimmed = text.length > 12000 ? text.slice(0, 12000) : text;
    res.status(200).json({ text: trimmed, truncated: text.length > 12000 });
  } catch (e) {
    res.status(500).json({ error: "URL을 가져오는 중 오류가 발생했어요: " + e.message + " — 텍스트를 직접 붙여넣어 주세요." });
  }
};
