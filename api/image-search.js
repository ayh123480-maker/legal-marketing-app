const { isAuthenticated } = require("../lib/auth");

/**
 * 칼럼 리치 에디터의 이미지 검색(Openverse) 서버 프록시.
 * 원래는 (카드뉴스 기능처럼) 브라우저가 api.openverse.org를 직접 호출했는데,
 * 사용자 네트워크 환경에 따라 그 요청 자체가 계속 타임아웃 나는 사례가 있었음
 * (2026-09-15 — "응답이 너무 늦어요"가 매번 뜸). Vercel 서버 쪽 네트워크는 이
 * 문제와 무관하니, 검색은 서버에서 대신 하고 결과만 클라이언트에 내려준다.
 *
 * 직접 확인해보니 Openverse 쪽이 실제로 응답을 아예 안 주는(15초 넘게 0바이트)
 * 상태였음 — 우리 코드/네트워크 문제가 아니라 그쪽 서비스 자체 장애. 카드뉴스
 * 기능도 이미 같은 API를 쓰면서 이 문제를 겪은 이력이 있음(DESIGN.md 참고).
 * 그래도 일시적 지연일 수 있으니 한 번은 재시도하되, Vercel 함수 실행시간
 * 제한에 걸리지 않게 시도당 타임아웃을 짧게(4초) 잡는다.
 */
async function fetchOnce(query, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(
      "https://api.openverse.org/v1/images/?q=" + encodeURIComponent(query) + "&page_size=12",
      { signal: controller.signal }
    );
    return response;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async (req, res) => {
  if (!isAuthenticated(req)) {
    res.status(401).json({ error: "로그인이 필요해요." });
    return;
  }
  const query = String(req.query.q || "").trim();
  if (!query) {
    res.status(400).json({ error: "검색어가 필요해요." });
    return;
  }

  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetchOnce(query, 4000);
      if (!response.ok) {
        lastError = "Openverse 응답 상태 " + response.status;
        continue;
      }
      const data = await response.json();
      const results = (data.results || [])
        .map((r) => ({ thumb: r.thumbnail || r.url, full: r.url }))
        .filter((r) => r.full);
      res.status(200).json({ results });
      return;
    } catch (e) {
      lastError = e.name === "AbortError" ? "응답 시간이 너무 오래 걸려요" : e.message;
    }
  }
  res.status(502).json({ error: lastError });
};
