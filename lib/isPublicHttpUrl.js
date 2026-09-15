/**
 * api/image-fetch.js가 사용자가 고른 외부 이미지 URL을 서버에서 대신 fetch해줄 때,
 * 내부망/클라우드 메타데이터 주소(SSRF)로 향하지 않게 막는 최소한의 가드.
 * 인증된 사용자만 쓰는 기능이라 완벽할 필요는 없지만, "이 서버가 내 대신 아무
 * URL이나 요청해준다"는 기능 자체가 잠재적 SSRF 통로라 기본적인 차단은 해둔다.
 */
function isPublicHttpUrl(urlString) {
  let parsed;
  try {
    parsed = new URL(String(urlString || ""));
  } catch (e) {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;

  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host === "0.0.0.0" || host === "::1" || host === "") return false;

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 127 || a === 10 || a === 0) return false; // 루프백/사설망
    if (a === 169 && b === 254) return false; // 링크로컬(클라우드 메타데이터 주소 포함)
    if (a === 172 && b >= 16 && b <= 31) return false; // 사설망
    if (a === 192 && b === 168) return false; // 사설망
  }
  return true;
}

module.exports = { isPublicHttpUrl };
