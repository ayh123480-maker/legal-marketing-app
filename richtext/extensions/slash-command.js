import { Extension } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import { createBlockItems } from "../commands/block-items.js";
import { createCommandMenu } from "../ui/command-menu.js";

/**
 * "/" 슬래시 커맨드. @tiptap/suggestion(멘션 기능 등에 쓰이는 공식 저수준 유틸)을
 * 그대로 사용 — 트리거 문자 감지, 쿼리 텍스트 추적, 커맨드 실행 시 "/query" 텍스트
 * 자동 삭제까지 프레임워크가 처리해준다.
 */
export function createSlashCommandExtension({ openImagePanel }) {
  const items = createBlockItems({ openImagePanel });

  return Extension.create({
    name: "slashCommand",
    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          char: "/",
          allowSpaces: false,
          items: ({ query }) => {
            const q = query.toLowerCase();
            if (!q) return items;
            return items.filter((it) => it.keywords.some((k) => k.toLowerCase().includes(q)));
          },
          command: ({ editor, range, props }) => {
            props.command({ editor, range });
          },
          render: createCommandMenu,
        }),
      ];
    },
  });
}
