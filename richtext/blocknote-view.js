/**
 * 공개 칼럼 페이지(/c/:slug, 로그인 없이 열람)에서 BlockNote JSON 본문을 실제
 * 서식(굵게·색상·이미지·코드블록 등)이 살아있는 HTML로 바꿔서 보여주기 위한
 * 가벼운 렌더러. 편집용 richtext/blocknote-editor.js와 달리 React/Mantine UI
 * 전체를 띄우지 않고 @blocknote/core만 헤드리스로 불러와서 BlockNote 자체
 * 변환 함수(blocksToHTMLLossy)로 HTML을 뽑아낸 뒤 정적으로 꽂아 넣는다 —
 * 방문자 대부분은 편집하지 않으므로 React/Mantine(약 1.3MB)까지 받을 필요가 없다.
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
