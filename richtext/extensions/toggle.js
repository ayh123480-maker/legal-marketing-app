import { Node, mergeAttributes } from "@tiptap/core";

/**
 * 노션 스타일 토글 블록. 구조는 세 계층:
 *   toggle (open 속성을 들고 있는 컨테이너)
 *     └─ toggleSummary (한 줄, 항상 보임 — <summary>)
 *     └─ toggleContent (block+ 여러 블록을 담을 수 있음 — 접혔을 땐 CSS로 숨김)
 *
 * 화살표 버튼은 PM이 관리하는 contentDOM 바깥(형제)에 붙여서, "화살표 다음에
 * summary가 온다"는 시각적 배치를 nodeView가 직접 만든 DOM 구조로 해결한다 —
 * PM의 contentDOM은 자식 노드 두 개(summary, content)를 순서대로만 넣어주므로
 * 화살표를 그 사이에 끼워 넣을 수 없어서, 화살표는 절대위치로 왼쪽에 띄우고
 * summary/content는 그 옆 contentDOM 안에서 문서 순서대로 렌더링되게 함.
 */
export const ToggleSummary = Node.create({
  name: "toggleSummary",
  content: "inline*",
  defining: true,
  parseHTML() {
    return [{ tag: "summary" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["summary", HTMLAttributes, 0];
  },
});

export const ToggleContent = Node.create({
  name: "toggleContent",
  content: "block+",
  defining: true,
  parseHTML() {
    return [{ tag: 'div[data-type="toggle-content"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "toggle-content" }), 0];
  },
});

export const Toggle = Node.create({
  name: "toggle",
  group: "block",
  content: "toggleSummary toggleContent",
  defining: true,

  addAttributes() {
    return {
      open: { default: true },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="toggle"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "toggle" }), 0];
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      let currentNode = node;

      const dom = document.createElement("div");
      dom.className = "rte-toggle";
      dom.setAttribute("data-type", "toggle");

      const arrow = document.createElement("button");
      arrow.type = "button";
      arrow.contentEditable = "false";
      arrow.className = "rte-toggle-arrow";

      const contentDOM = document.createElement("div");
      contentDOM.className = "rte-toggle-body";

      dom.append(arrow, contentDOM);

      function sync(n) {
        const open = !!n.attrs.open;
        dom.classList.toggle("is-open", open);
        arrow.textContent = open ? "▾" : "▸";
      }
      sync(currentNode);

      arrow.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const pos = typeof getPos === "function" ? getPos() : null;
        if (pos == null) return;
        editor.view.dispatch(
          editor.view.state.tr.setNodeMarkup(pos, undefined, { ...currentNode.attrs, open: !currentNode.attrs.open })
        );
      });

      return {
        dom,
        contentDOM,
        update(updatedNode) {
          if (updatedNode.type !== currentNode.type) return false;
          currentNode = updatedNode;
          sync(currentNode);
          return true;
        },
      };
    };
  },
});
