import { Node, mergeAttributes } from "@tiptap/core";

/**
 * 노션 스타일 콜아웃 블록: [이모지] [텍스트]. 이모지를 클릭하면 몇 가지 후보를
 * 순환하며 바꿀 수 있다. 내용은 인라인 텍스트만 담는다(단일 문단형 콜아웃).
 */
const EMOJI_CYCLE = ["💡", "📌", "⚠️", "✅", "❗", "ℹ️", "🔥", "📝"];

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "inline*",
  defining: true,

  addAttributes() {
    return {
      emoji: { default: "💡" },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "callout", class: "callout" }),
      ["span", { class: "callout-emoji" }, node.attrs.emoji],
      ["div", { class: "callout-content" }, 0],
    ];
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      let currentNode = node;

      const dom = document.createElement("div");
      dom.className = "callout";
      dom.setAttribute("data-type", "callout");

      const emojiBtn = document.createElement("button");
      emojiBtn.type = "button";
      emojiBtn.className = "callout-emoji";
      emojiBtn.contentEditable = "false";
      emojiBtn.title = "아이콘 바꾸기";
      emojiBtn.textContent = currentNode.attrs.emoji;
      emojiBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const pos = typeof getPos === "function" ? getPos() : null;
        if (pos == null) return;
        const cur = EMOJI_CYCLE.indexOf(currentNode.attrs.emoji);
        const next = EMOJI_CYCLE[(cur + 1 + EMOJI_CYCLE.length) % EMOJI_CYCLE.length];
        editor.view.dispatch(
          editor.view.state.tr.setNodeMarkup(pos, undefined, { ...currentNode.attrs, emoji: next })
        );
      });

      const content = document.createElement("div");
      content.className = "callout-content";

      dom.append(emojiBtn, content);

      return {
        dom,
        contentDOM: content,
        update(updatedNode) {
          if (updatedNode.type !== currentNode.type) return false;
          currentNode = updatedNode;
          emojiBtn.textContent = updatedNode.attrs.emoji;
          return true;
        },
      };
    };
  },
});
