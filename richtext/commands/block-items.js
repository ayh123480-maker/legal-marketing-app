/**
 * "/" 슬래시 메뉴와 "+" 블록 추가 메뉴가 공유하는 블록 타입 목록.
 * 새 블록 타입을 추가하려면 여기 한 곳에만 추가하면 두 메뉴에 모두 반영된다.
 */
export function createBlockItems({ openImagePanel }) {
  return [
    {
      key: "text",
      title: "텍스트",
      description: "일반 문단으로 씁니다.",
      icon: "📝",
      keywords: ["text", "텍스트", "paragraph", "문단"],
      command: ({ editor, range }) => run(editor, range, (c) => c.setNode("paragraph")),
    },
    {
      key: "h1",
      title: "제목 1",
      description: "가장 큰 섹션 제목.",
      icon: "H1",
      keywords: ["heading1", "h1", "제목1", "대제목"],
      command: ({ editor, range }) => run(editor, range, (c) => c.setNode("heading", { level: 1 })),
    },
    {
      key: "h2",
      title: "제목 2",
      description: "중간 크기 섹션 제목.",
      icon: "H2",
      keywords: ["heading2", "h2", "제목2", "중제목"],
      command: ({ editor, range }) => run(editor, range, (c) => c.setNode("heading", { level: 2 })),
    },
    {
      key: "h3",
      title: "제목 3",
      description: "작은 섹션 제목.",
      icon: "H3",
      keywords: ["heading3", "h3", "제목3", "소제목"],
      command: ({ editor, range }) => run(editor, range, (c) => c.setNode("heading", { level: 3 })),
    },
    {
      key: "bulletList",
      title: "글머리 기호 목록",
      description: "목록 항목을 순서 없이 나열합니다.",
      icon: "•",
      keywords: ["bullet", "list", "목록", "불릿"],
      command: ({ editor, range }) => run(editor, range, (c) => c.toggleBulletList()),
    },
    {
      key: "orderedList",
      title: "번호 매기기 목록",
      description: "번호가 매겨진 목록입니다.",
      icon: "1.",
      keywords: ["ordered", "number", "번호", "목록"],
      command: ({ editor, range }) => run(editor, range, (c) => c.toggleOrderedList()),
    },
    {
      key: "taskList",
      title: "할 일 목록",
      description: "체크박스가 있는 목록입니다.",
      icon: "☑",
      keywords: ["todo", "task", "할일", "체크"],
      command: ({ editor, range }) => run(editor, range, (c) => c.toggleTaskList()),
    },
    {
      key: "toggle",
      title: "토글 목록",
      description: "클릭해서 여닫는 접이식 블록입니다.",
      icon: "▸",
      keywords: ["toggle", "토글", "접기"],
      command: ({ editor, range }) => {
        const from = range.from;
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent({
            type: "toggle",
            content: [
              { type: "toggleSummary", content: [] },
              { type: "toggleContent", content: [{ type: "paragraph" }] },
            ],
          })
          .run();
        editor.commands.setTextSelection(from + 2);
      },
    },
    {
      key: "quote",
      title: "인용",
      description: "인용구 블록입니다.",
      icon: "❝",
      keywords: ["quote", "인용"],
      command: ({ editor, range }) => run(editor, range, (c) => c.toggleBlockquote()),
    },
    {
      key: "callout",
      title: "콜아웃",
      description: "눈에 띄는 강조 박스입니다.",
      icon: "💡",
      keywords: ["callout", "콜아웃", "강조"],
      command: ({ editor, range }) => run(editor, range, (c) => c.setNode("callout")),
    },
    {
      key: "code",
      title: "코드",
      description: "고정폭 글꼴 코드 블록입니다.",
      icon: "</>",
      keywords: ["code", "코드"],
      command: ({ editor, range }) => run(editor, range, (c) => c.toggleCodeBlock()),
    },
    {
      key: "divider",
      title: "구분선",
      description: "섹션을 구분하는 선입니다.",
      icon: "—",
      keywords: ["divider", "구분선", "hr"],
      command: ({ editor, range }) => run(editor, range, (c) => c.setHorizontalRule()),
    },
    {
      key: "image",
      title: "이미지",
      description: "업로드, 붙여넣기, 검색으로 삽입합니다.",
      icon: "🖼️",
      keywords: ["image", "이미지", "그림", "사진"],
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run();
        openImagePanel(editor);
      },
    },
  ];
}

function run(editor, range, fn) {
  const chain = editor.chain().focus();
  const withDelete = range ? chain.deleteRange(range) : chain;
  fn(withDelete).run();
}
