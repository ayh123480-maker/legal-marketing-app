const { buildSessionCookie } = require("../lib/auth");
const { parseBody } = require("../lib/parseBody");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!process.env.APP_PASSWORD) {
    res.status(500).json({ error: "서버에 APP_PASSWORD 환경변수가 설정되지 않았어요." });
    return;
  }
  if (!process.env.SESSION_SECRET) {
    res.status(500).json({ error: "서버에 SESSION_SECRET 환경변수가 설정되지 않았어요." });
    return;
  }
  const body = await parseBody(req);
  const { password } = body || {};
  if (password !== process.env.APP_PASSWORD) {
    res.status(401).json({ error: "비밀번호가 올바르지 않아요." });
    return;
  }
  res.setHeader("Set-Cookie", buildSessionCookie());
  res.status(200).json({ ok: true });
};
