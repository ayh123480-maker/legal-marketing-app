/**
 * 이 프로젝트 전용 칼럼 CMS 에디터의 진입점 — 예전엔 Tiptap/ProseMirror 위에
 * 콜아웃·토글·슬래시메뉴·버블메뉴·블록핸들을 전부 직접 구현했었는데(2026-09-16
 * 이전), 유지보수가 힘들고 완성도도 떨어져서 검증된 블록 에디터 라이브러리인
 * BlockNote(https://blocknotejs.org)로 통째로 교체했다. UI도 BlockNote가 기본
 * 제공하는 UI를 그대로 쓰고 커스텀 UI는 만들지 않는다.
 *
 * 번들러가 없는 프로젝트라 React/BlockNote도 이 파일의 다른 import들처럼 importmap
 * 없이 esm.sh CDN에서 바로 불러온다.
 *
 * ⚠️ 2026-09-16 실서비스에서 겪은 버그와 그 원인(중요 — 이 파일 다시 손댈 때 꼭 읽을 것):
 * 처음엔 "@blocknote/mantine"의 BlockNoteView와 "@blocknote/core"의 BlockNoteEditor를
 * 각각 별도 esm.sh 요청(둘 다 &bundle)으로 불러왔었다. 그랬더니 에디터가 뜨고 타이핑은
 * 되는데 슬래시메뉴·서식 툴바·사이드 메뉴가 전부 하나도 안 뜨는 문제가 있었다.
 * 원인: BlockNoteView가 내부적으로 "editor.getExtension(FormattingToolbarExtension)"
 * 처럼 확장 기능을 "클래스 참조"로 찾아서 있어야만 그 UI를 그려주는데, "&bundle"로 각각
 * 따로 받아온 두 요청은 esm.sh가 매번 독립적으로 번들링하기 때문에 "@blocknote/core"의
 * 사본이 둘 생겨버렸다 — 에디터를 만든 core 사본과 BlockNoteView가 들고 있는 core
 * 사본이 서로 다른 자바스크립트 객체라 클래스 참조 비교가 항상 실패해서 모든 UI가
 * 조용히 꺼진 것(에디터 자체는 살아있어서 겉보기엔 "일부만 구현된 것"처럼 보였음).
 *
 * 그렇다고 "&bundle"을 빼고 "@blocknote/core"를 직접 받아오면 이번엔 반대로 진짜
 * 크래시가 난다("Duplicate use of selection JSON ID multiple-node") — 여러 패키지가
 * 저마다 @tiptap/pm(ProseMirror)의 하위 조각을 별도로 물고 오면서 같은 셀렉션 클래스를
 * 두 번 등록해버리기 때문.
 *
 * 실제로 통하는 조합(아래 코드가 하는 것):
 *  1) "@blocknote/react"만 그 자체로 "&bundle"(자기 완결형 단일 파일) — 여기서
 *     BlockNoteEditor 생성(useCreateBlockNote)과 UI 조립(BlockNoteViewRaw,
 *     ComponentsContext)을 전부 같은 파일 안에서 가져오므로 클래스 참조가 항상 일치함.
 *  2) "@blocknote/mantine"도 "&bundle"이지만 react/react-dom과 함께
 *     @mantine/core·@mantine/hooks를 ?deps=로 "외부 공유" 취급시켜서, 멘타인 스타일
 *     컴포넌트 모음(components)과 CSS만 얻어옴(에디터 로직은 안 씀).
 *  3) "@mantine/core"를 "&bundle" 없이 따로 받아와 MantineProvider를 얻되, ?deps=
 *     순서를 (2)의 멘타인 번들이 내부적으로 물고 있는 것과 글자 그대로 맞춰서
 *     (@mantine/hooks, react-dom, react 순서) 브라우저가 "완전히 같은 파일"로 캐싱해
 *     재사용하게 만든다 — 그래야 MantineProvider의 컨텍스트를 멘타인 스타일 컴포넌트가
 *     알아본다("MantineProvider was not found" 에러 방지).
 * 이 세 조합을 실제로 Playwright로 슬래시메뉴·서식 툴바가 뜨는 것까지 확인했다.
 * 버전을 올리거나 조합을 바꿀 땐 반드시 다시 이렇게 실물로 확인할 것 — 겉보기엔
 * 멀쩡히 마운트되는데 UI만 조용히 빠지는 실패 모드라 눈으로 훑어서는 못 알아챈다.
 *
 * lib/renderColumnPage.js의 인라인 스크립트가 이 함수 하나만 호출해서 마운트한다.
 *
 * @param {HTMLElement} mountEl - 에디터가 들어갈 wrapper
 * @returns {Promise<object>} 문서 로드/조회/저장을 위한 얇은 API
 */

const REACT_VERSION = "18.3.1";
const MANTINE_VERSION = "8.3.11";

/**
 * 이 에디터가 실제로 얹히는 화면(lib/renderColumnPage.js의 편집 모달)은 칼럼
 * 열람 페이지와 같은 "애플 뉴스룸풍" 팔레트(연회색 배경 #f5f5f7, 잉크 #1d1d1f,
 * 블루 액센트 #0071e3)를 쓴다 — BlockNote 기본 테마(파랑기 도는 회색조)가
 * "너무 밋밋하고 싸구려 느낌"이라는 피드백(2026-09-16)을 받고, 그 페이지 팔레트에
 * 맞춰 커스텀 테마를 추가함.
 */
const SITE_THEME = {
  colors: {
    editor: { text: "#1d1d1f", background: "#ffffff" },
    menu: { text: "#1d1d1f", background: "#ffffff" },
    tooltip: { text: "#f5f5f7", background: "#1d1d1f" },
    hovered: { text: "#1d1d1f", background: "#f5f5f7" },
    selected: { text: "#ffffff", background: "#0071e3" },
    disabled: { text: "#86868b", background: "#f5f5f7" },
    shadow: "#d2d2d7",
    border: "#d2d2d7",
    sideMenu: "#6e6e73",
  },
  borderRadius: 10,
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
};

const MANTINE_CSS_LINK_ID = "bn-mantine-style-css";

/**
 * @blocknote/mantine의 실제 시각 스타일(멘타인 버튼·메뉴·팝오버 CSS와
 * ".bn-mantine{...}" 변수 스코프)은 esm.sh로 JS만 받아온다고 자동으로 안 딸려온다
 * — BlockNote 공식 사용법대로 "@blocknote/mantine/style.css"를 따로 불러와야
 * 하는데, 그 파일이 상대경로로 문 "./mantineStyles.css"를 물고 있고 그 파일은
 * esm.sh의 exports map 제한에 걸려 404가 난다(BlockNote 패키징 쪽의 실수로 보임 —
 * package.json exports에 "./mantineStyles.css"가 아예 없음). jsdelivr는 이 제한이
 * 없어서 그대로 서빙해준다(2026-09-16, "슬래시 메뉴가 배경·아이콘 하나 없이 글자만
 * 좍 늘어서 보인다"는 문제를 이렇게 확인하고 고쳤음 — 안 믿기면 CDN을 다시 esm.sh로
 * 바꿔서 스샷 찍어볼 것).
 */
function ensureMantineStylesheet() {
  if (document.getElementById(MANTINE_CSS_LINK_ID)) return;
  const link = document.createElement("link");
  link.id = MANTINE_CSS_LINK_ID;
  link.rel = "stylesheet";
  link.href = "https://cdn.jsdelivr.net/npm/@blocknote/mantine@0.54.2/src/style.css";
  document.head.appendChild(link);
}

async function loadModules() {
  ensureMantineStylesheet();
  const deps = `react@${REACT_VERSION},react-dom@${REACT_VERSION}`;
  const mantineDeps = `${deps},@mantine/core@${MANTINE_VERSION},@mantine/hooks@${MANTINE_VERSION}`;
  // @blocknote/mantine이 내부적으로 @mantine/core를 물고 오는 순서(hooks, react-dom, react)와
  // 글자 그대로 맞춰야 브라우저가 같은 파일로 재사용한다 — 순서를 바꾸면 안 됨.
  const mantineCoreDeps = `@mantine/hooks@${MANTINE_VERSION},react-dom@${REACT_VERSION},react@${REACT_VERSION}`;

  const [React, ReactDOMClient, reactMod, mantineMod, mantineCoreMod] = await Promise.all([
    import(/* @vite-ignore */ `https://esm.sh/react@${REACT_VERSION}`),
    import(/* @vite-ignore */ `https://esm.sh/react-dom@${REACT_VERSION}/client?deps=react@${REACT_VERSION}`),
    import(/* @vite-ignore */ `https://esm.sh/@blocknote/react@0.54.2?deps=${deps}&bundle`),
    import(/* @vite-ignore */ `https://esm.sh/@blocknote/mantine@0.54.2?deps=${mantineDeps}&bundle`),
    import(/* @vite-ignore */ `https://esm.sh/@mantine/core@${MANTINE_VERSION}?deps=${mantineCoreDeps}`),
  ]);
  return { React, ReactDOMClient, reactMod, mantineMod, mantineCoreMod };
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
  const { React, ReactDOMClient, reactMod, mantineMod, mantineCoreMod } = await loadModules();
  const { useCreateBlockNote, BlockNoteViewRaw, ComponentsContext } = reactMod;
  const { components, applyBlockNoteCSSVariablesFromTheme } = mantineMod;
  const { MantineProvider } = mantineCoreMod;

  let editorInstance = null;
  let resolveReady;
  const readyPromise = new Promise((resolve) => {
    resolveReady = resolve;
  });

  function ColumnEditorApp() {
    const editor = useCreateBlockNote({
      uploadFile: (file) => resizeImageFile(file),
    });
    React.useEffect(() => {
      editorInstance = editor;
      resolveReady(editor);
    }, [editor]);

    // 사이드 메뉴·서식 툴바 같은 팝업은 editor.portalElement 아래에 별도로 붙기 때문에
    // (bn-container 안에 있지만 React 트리 밖) 테마 색상 변수를 그 노드에도 따로
    // 적용해줘야 팝업까지 색이 맞는다 — @blocknote/mantine의 BlockNoteView가 내부적으로
    // 하는 것과 같은 방식(ref 콜백 + portalElement 양쪽에 적용).
    const applyTheme = React.useCallback(
      (node) => {
        if (node) applyBlockNoteCSSVariablesFromTheme(SITE_THEME, node);
      },
      []
    );
    React.useEffect(() => {
      if (editor.portalElement) applyTheme(editor.portalElement);
    }, [editor, applyTheme]);

    return React.createElement(
      MantineProvider,
      { withCssVariables: false, getRootElement: () => undefined },
      React.createElement(
        ComponentsContext.Provider,
        { value: components },
        // className="bn-mantine": @blocknote/mantine이 원래 자동으로 붙여주는 클래스인데,
        // BlockNoteViewRaw를 직접 쓰면서(위 주석 참고) 우리가 놓치고 있었다 — 멘타인
        // CSS의 --mantine-* 변수가 전부 ".bn-mantine" 스코프로 정의돼 있어서, 이게
        // 없으면 버튼·메뉴가 스타일 하나도 안 먹은 맨 텍스트로 보인다(2026-09-16
        // 실제로 겪은 문제 — 슬래시 메뉴가 카드/배경 없이 글자만 좍 늘어서 보였음).
        React.createElement(BlockNoteViewRaw, { editor, theme: "light", className: "bn-mantine", ref: applyTheme })
      )
    );
  }

  const root = ReactDOMClient.createRoot(mountEl);
  root.render(React.createElement(ColumnEditorApp));
  await readyPromise;

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
          blocks = await editorInstance.tryParseHTMLToBlocks(data.bodyHtml);
        } else {
          blocks = plainTextToBlocks(data && data.bodyRaw);
        }
      } catch (e) {
        blocks = plainTextToBlocks(data && data.bodyRaw);
      }
      editorInstance.replaceBlocks(editorInstance.document, blocks.length ? blocks : plainTextToBlocks(""));
    },
    getBlocks() {
      return editorInstance.document;
    },
    isEmpty() {
      return isEmptyBlocks(editorInstance.document);
    },
    focus() {
      editorInstance.focus();
    },
  };
}
