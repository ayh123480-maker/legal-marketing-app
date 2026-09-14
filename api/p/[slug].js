const { kv } = require("@vercel/kv");
const { renderColumnPage, renderNotFoundPage } = require("../../lib/renderColumnPage");

/**
 * 발행된 칼럼 페이지를 로그인 없이 공개로 보여주는 라우트.
 * vercel.json의 rewrite로 /c/:slug 가 이 함수로 연결된다.
 * (칼럼 마케팅 콘텐츠는 외부 독자에게 보여주는 게 목적이라 인증을 걸지 않는다 —
 *  api/publish-page.js로 "저장"할 때만 로그인이 필요하다)
 */
module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).send("Method not allowed");
    return;
  }

  const slug = req.query.slug;
  try {
    const record = await kv.get(`pubpage:${slug}`);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    if (!record) {
      res.status(404).send(renderNotFoundPage());
      return;
    }
    res.status(200).send(renderColumnPage(record, { slug }));
  } catch (e) {
    res.status(500).send("페이지를 불러오지 못했어요: " + e.message);
  }
};
