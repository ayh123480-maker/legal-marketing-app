/**
 * 공개 칼럼 페이지(/c/:slug, 로그인 없이 열람)에서 BlockNote JSON 본문을 실제
 * 서식(굵게·색상·이미지·코드블록 등)이 살아있는 HTML로 바꿔서 보여주기 위한
 * 가벼운 렌더러. @blocknote/core만 헤드리스로 불러와서 BlockNote 자체 변환
 * 함수(blocksToHTMLLossy)로 HTML을 뽑아낸 뒤 정적으로 꽂아 넣는다.
 *
 * 2026-09-16: 칼럼 작성을 BlockNote 에디터에서 노션 연동(lib/notionToHtml.js)
 * 방식으로 바꾸면서 편집용 richtext/blocknote-editor.js는 삭제했다 — 이
 * 파일은 그 이전에 BlockNote로 저장된 레거시 레코드(bodyFormat:
 * "blocknote-json")를 읽기 전용으로 계속 보여주기 위해서만 남겨뒀다.
 *
 * lib/renderColumnPage.js가 본문을 서버에서 미리 아주 단순한 문단 텍스트로
 * 깔아두고(JS 없이도 읽을 수 있게), 이 모듈이 로드되면 그 자리를 실제 서식이
 * 살아있는 HTML로 교체한다(점진적 향상).
 */

const BLOCKNOTE_VERSION = "0.54.2";

export async function renderBlocksInto(mountEl, blocks) {
  if (!Array.isArray(blocks) || !blocks.length) return;
  const { BlockNoteEditor } = await import(/* @vite-ignore */ `https://esm.sh/@blocknote/core@${BLOCKNOTE_VERSION}?bundle`);
  const editor = BlockNoteEditor.create({ initialContent: blocks });
  const html = await editor.blocksToHTMLLossy(blocks);
  mountEl.innerHTML = html;
}
