/**
 * 이 프로젝트 전용 칼럼 CMS 에디터의 진입점 — 예전엔 Tiptap/ProseMirror 위에
 * 콜아웃·토글·슬래시메뉴·버블메뉴·블록핸들을 전부 직접 구현했었는데(2026-09-16
 * 이전), 유지보수가 힘들고 완성도도 떨어져서 검증된 블록 에디터 라이브러리인
 * BlockNote(https://blocknotejs.org)로 통째로 교체했다. UI도 BlockNote가 기본
 * 제공하는 BlockNoteView(멘타인 테마)를 그대로 쓰고 커스텀 UI는 만들지 않는다.
 *
 * 번들러가 없는 프로젝트라 React/BlockNote도 이 파일의 다른 import들처럼 importmap
 * 없이 esm.sh CDN에서 바로 불러온다. 여러 esm.sh 패키지가 서로 다른 React 인스턴스를
 * 물고 오면 "Invalid hook call" 에러가 나므로, 모든 패키지에 정확히 같은 React/
 * ReactDOM 버전을 ?deps=로 명시해서 하나의 React 인스턴스만 로드되게 고정한다.
 *
 * lib/renderColumnPage.js의 인라인 스크립트가 이 함수 하나만 호출해서 마운트한다.
 *
 * @param {HTMLElement} mountEl - 에디터가 들어갈 wrapper
 * @returns {Promise<object>} 문서 로드/조회/저장을 위한 얇은 API
 */

const REACT_VERSION = "18.3.1";
const BLOCKNOTE_VERSION = "0.54.2";
const MANTINE_VERSION = "8.3.11";
const DEPS = `react@${REACT_VERSION},react-dom@${REACT_VERSION},@mantine/core@${MANTINE_VERSION},@mantine/hooks@${MANTINE_VERSION}`;

function esm(pkg) {
  return `https://esm.sh/${pkg}@${BLOCKNOTE_VERSION}?deps=${DEPS}&bundle`;
}

async function loadModules() {
  const [React, ReactDOMClient, core, mantine] = await Promise.all([
    import(/* @vite-ignore */ `https://esm.sh/react@${REACT_VERSION}`),
    import(/* @vite-ignore */ `https://esm.sh/react-dom@${REACT_VERSION}/client?deps=react@${REACT_VERSION}`),
    import(/* @vite-ignore */ esm("@blocknote/core")),
    import(/* @vite-ignore */ esm("@blocknote/mantine")),
  ]);
  return { React, ReactDOMClient, core, mantine };
}

function isEmptyBlocks(blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0) return true;
  if (blocks.length > 1) return false;
  const only = blocks[0];
  return only && only.type === "paragraph" && (!only.content || only.content.length === 0);
}

/** 문단 사이 빈 줄로만 구분된 예전 평문 칼럼 본문을 최소한의 문단 블록으로 바꾼다. */
function plainTextToBlocks(text) {
  const chunks = String(text || "")
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!chunks.length) return [{ type: "paragraph", content: [] }];
  return chunks.map((chunk) => ({
    type: "paragraph",
    content: [{ type: "text", text: chunk, styles: {} }],
  }));
}

function resizeImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxW = 1280;
        const scale = Math.min(1, maxW / img.naturalWidth);
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => reject(new Error("이미지를 불러오지 못했어요."));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("파일을 읽지 못했어요."));
    reader.readAsDataURL(file);
  });
}

export async function createColumnEditor(mountEl) {
  const { React, ReactDOMClient, core, mantine } = await loadModules();
  const { BlockNoteEditor } = core;
  const { BlockNoteView } = mantine;

  const editor = BlockNoteEditor.create({
    uploadFile: async (file) => resizeImageFile(file),
  });

  const root = ReactDOMClient.createRoot(mountEl);
  root.render(React.createElement(BlockNoteView, { editor, theme: "light" }));

  return {
    /**
     * 기존 저장 데이터를 이 에디터에 불러온다.
     * @param {{ bodyFormat?: string, bodyRaw?: string, bodyHtml?: string }} data
     */
    async setContent(data) {
      const format = data && data.bodyFormat;
      let blocks;
      try {
        if (format === "blocknote-json" && data.bodyRaw) {
          const parsed = JSON.parse(data.bodyRaw);
          blocks = Array.isArray(parsed) && parsed.length ? parsed : plainTextToBlocks("");
        } else if (format === "html" && data.bodyHtml) {
          blocks = await editor.tryParseHTMLToBlocks(data.bodyHtml);
        } else {
          blocks = plainTextToBlocks(data && data.bodyRaw);
        }
      } catch (e) {
        blocks = plainTextToBlocks(data && data.bodyRaw);
      }
      editor.replaceBlocks(editor.document, blocks.length ? blocks : plainTextToBlocks(""));
    },
    getBlocks() {
      return editor.document;
    },
    isEmpty() {
      return isEmptyBlocks(editor.document);
    },
    focus() {
      editor.focus();
    },
  };
}
