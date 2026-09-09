const crypto = require("crypto");

/**
 * 아주 단순한 "공유 비밀번호" 인증.
 * - 팀 전체가 같은 비밀번호(APP_PASSWORD)로 로그인
 * - 로그인 성공 시, SESSION_SECRET으로 서명한 고정값을 httpOnly 쿠키로 내려줌
 * - 이후 요청은 그 쿠키 값이 서명과 일치하는지만 검사 (별도 세션 DB 없음)
 */

function sign(secret) {
  return crypto.createHmac("sha256", secret).update("authenticated").digest("hex");
}

function getCookie(req, name) {
  const header = req.headers.cookie || "";
  const parts = header.split(";").map((s) => s.trim());
  const match = parts.find((s) => s.startsWith(name + "="));
  if (!match) return null;
  return decodeURIComponent(match.slice(name.length + 1));
}

function isAuthenticated(req) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return false;
  const token = getCookie(req, "session");
  if (!token) return false;
  return token === sign(secret);
}

function buildSessionCookie() {
  const secret = process.env.SESSION_SECRET;
  const token = sign(secret);
  const maxAge = 60 * 60 * 24 * 30; // 30일
  return `session=${token}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

function buildClearCookie() {
  return `session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`;
}

module.exports = { isAuthenticated, buildSessionCookie, buildClearCookie };
