import { Editor, Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import ImageExt from "@tiptap/extension-image";

import { Callout } from "./extensions/callout.js";
import { Toggle, ToggleSummary, ToggleContent } from "./extensions/toggle.js";
import { FontSize } from "./extensions/font-size.js";
import { createSlashCommandExtension } from "./extensions/slash-command.js";
import { createBubbleMenu } from "./ui/bubble-menu.js";
import { createLinkPopover } from "./ui/link-popover.js";
import { createBlockHandle } from "./ui/block-handle.js";
import { createImagePanel, resizeImageFile } from "./ui/image-panel.js";

/**
 * 이 프로젝트 전용 노션풍 블록 에디터의 진입점. lib/renderColumnPage.js의 인라인
 * 스크립트가 이 함수 하나만 호출해서 마운트한다.
 *
 * @param {HTMLElement} mountEl - 에디터가 들어갈 wrapper (position:relative 필요,
 *   block-handle이 그 안에 +/⋮⋮ 버튼을 절대위치로 띄운다)
 * @param {{ onChange?: (html:string)=>void }} options
 * @returns 문서 로드/조회/포커스 등을 위한 얇은 API
 */
export function createColumnEditor(mountEl, options = {}) {
  const LinkWithShortcut = Extension.create({
    name: "linkShortcut",
    addKeyboardShortcuts() {
      return {
        "Mod-k": () => {
          const { from, to, empty } = this.editor.state.selection;
          if (empty) return true;
          const start = this.editor.view.coordsAtPos(from);
          const end = this.editor.view.coordsAtPos(to);
          linkPopover.openForSelection({
            left: Math.min(start.left, end.left),
            bottom: Math.max(start.bottom, end.bottom),
          });
          return true;
        },
      };
    },
  });

  const imagePanel = createImagePanel({
    insertImage: (dataUrl) => editor.chain().focus().setImage({ src: dataUrl }).run(),
  });

  const editor = new Editor({
    element: mountEl,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
      }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      TextStyle,
      Color,
      FontSize,
      Highlight.configure({ multicolor: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({
        placeholder: ({ node, editor: ed }) => {
          if (node.type.name === "paragraph" && ed.state.doc.childCount === 1 && node.content.size === 0) {
            return "글자를 입력하거나 '/'를 입력해 명령어를 사용하세요";
          }
          if (node.type.name === "heading") {
            const label = node.attrs.level === 2 ? "제목 1" : node.attrs.level === 3 ? "제목 2" : "제목 3";
            return label;
          }
          if (node.type.name === "toggleSummary") return "토글 제목";
          return "";
        },
      }),
      ImageExt.configure({ inline: false }),
      Callout,
      Toggle,
      ToggleSummary,
      ToggleContent,
      LinkWithShortcut,
      createSlashCommandExtension({ openImagePanel: () => imagePanel.open() }),
    ],
    content: "<p></p>",
    editorProps: {
      attributes: { class: "rte-content" },
      handlePaste(view, event) {
        const items = event.clipboardData && event.clipboardData.items;
        if (!items) return false;
        let imageItem = null;
        for (let i = 0; i < items.length; i++) {
          if (items[i].type && items[i].type.indexOf("image/") === 0) {
            imageItem = items[i];
            break;
          }
        }
        if (!imageItem) return false; // 이미지가 아니면 Tiptap 기본 붙여넣기(리치 HTML/텍스트)로
        event.preventDefault();
        const file = imageItem.getAsFile();
        if (!file) return true;
        resizeImageFile(file).then((dataUrl) => {
          editor.chain().focus().setImage({ src: dataUrl }).run();
        });
        return true;
      },
      handleClickOn(view, pos, node, nodePos, event) {
        const target = event.target;
        const anchor = target && target.closest && target.closest("a[href]");
        if (anchor) {
          event.preventDefault();
          const rect = anchor.getBoundingClientRect();
          linkPopover.openForExistingLink(rect, anchor.getAttribute("href"));
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      scheduleChange(ed);
    },
  });

  const linkPopover = createLinkPopover(editor);
  createBubbleMenu(editor, {
    onLinkRequest: (rect) => linkPopover.openForSelection(rect),
  });
  createBlockHandle(editor, mountEl, {
    openImagePanel: () => imagePanel.open(),
  });

  let changeTimer = null;
  function scheduleChange(ed) {
    if (!options.onChange) return;
    if (changeTimer) clearTimeout(changeTimer);
    changeTimer = setTimeout(() => {
      options.onChange(ed.getHTML());
    }, 600); // Notion류 autosave와 비슷하게 짧은 debounce
  }

  return {
    editor,
    getHTML: () => editor.getHTML(),
    getJSON: () => editor.getJSON(),
    setHTML: (html) => editor.commands.setContent(html || "<p></p>", false),
    focus: () => editor.commands.focus(),
    isEmpty: () => editor.isEmpty,
    destroy: () => editor.destroy(),
  };
}
