const sanitizeHtml = require("sanitize-html");

/**
 * 칼럼 본문 리치 에디터(작성자 전용 전체화면 편집기)에서 저장/조회되는 HTML을 정제한다.
 * 이 HTML은 로그인 없이 열람 가능한 공개 페이지(api/p/[slug].js)에 그대로 삽입되므로,
 * 저장 시(api/publish-page.js)와 렌더 시(lib/renderColumnPage.js) 두 지점에서 모두
 * 이 함수를 거치게 해서 스크립트·이벤트 핸들러 등이 섞여 들어가지 않게 막는다.
 *
 * 지원하는 서식은 굵게·소제목(H2/H3)·콜아웃·이미지뿐이라 허용 태그도 그만큼만 열어둠.
 */
function sanitizeColumnBody(html) {
  return sanitizeHtml(String(html || ""), {
    allowedTags: [
      "p", "br", "strong", "b", "em", "i", "u", "s",
      "h2", "h3", "ul", "ol", "li", "blockquote", "div", "span", "img", "a",
    ],
    allowedAttributes: {
      div: ["class"],
      img: ["src", "alt"],
      a: ["href"],
    },
    allowedClasses: {
      div: ["callout"],
    },
    allowedSchemesByTag: {
      img: ["http", "https", "data"],
      a: ["http", "https"],
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }),
    },
    nonTextTags: ["style", "script", "textarea", "option"],
  }).trim();
}

module.exports = { sanitizeColumnBody };
