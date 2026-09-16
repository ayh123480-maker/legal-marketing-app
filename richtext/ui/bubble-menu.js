/**
 * 선택 영역 위에 뜨는 인라인 서식 툴바(Notion의 floating toolbar와 동일한 역할).
 * position:fixed로 띄워서 에디터 스크롤 컨테이너와 좌표 계산이 꼬이지 않게 한다.
 */
const TEXT_COLORS = [
  { label: "기본", value: null },
  { label: "빨강", value: "#e5484d" },
  { label: "주황", value: "#c2660b" },
  { label: "노랑", value: "#9a6b00" },
  { label: "초록", value: "#18794e" },
  { label: "파랑", value: "#0071e3" },
  { label: "보라", value: "#8145b5" },
  { label: "회색", value: "#6e6e73" },
];

const HIGHLIGHT_COLORS = [
  { label: "없음", value: null },
  { label: "노랑", value: "#fdf1a8" },
  { label: "초록", value: "#bdf0d1" },
  { label: "파랑", value: "#cfe6fd" },
  { label: "분홍", value: "#fbd6e0" },
  { label: "회색", value: "#e2e2e6" },
];

export function createBubbleMenu(editor, { onLinkRequest }) {
  const el = document.createElement("div");
  el.className = "rte-bubble-menu";
  el.hidden = true;

  const buttons = {};
  function makeBtn(key, label, title, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "rte-bubble-btn";
    b.title = title;
    b.innerHTML = label;
    b.addEventListener("mousedown", (e) => e.preventDefault());
    b.addEventListener("click", onClick);
    buttons[key] = b;
    el.appendChild(b);
    return b;
  }

  makeBtn("bold", "<b>B</b>", "굵게 (Ctrl/Cmd+B)", () => editor.chain().focus().toggleBold().run());
  makeBtn("italic", "<i>I</i>", "기울임 (Ctrl/Cmd+I)", () => editor.chain().focus().toggleItalic().run());
  makeBtn("underline", "<u>U</u>", "밑줄 (Ctrl/Cmd+U)", () => editor.chain().focus().toggleUnderline().run());
  makeBtn("strike", "<s>S</s>", "취소선", () => editor.chain().focus().toggleStrike().run());
  makeBtn("code", "&lt;/&gt;", "인라인 코드", () => editor.chain().focus().toggleCode().run());
  makeBtn("link", "🔗", "링크 (Ctrl/Cmd+K)", () => {
    const { from, to } = editor.state.selection;
    const rect = coordsForRange(editor, from, to);
    onLinkRequest(rect);
  });
  makeBtn("format", "Aa", "크기·색상·형광펜", () => {
    panel.hidden = !panel.hidden;
  });

  const panel = document.createElement("div");
  panel.className = "rte-format-panel";
  panel.hidden = true;
  el.appendChild(panel);

  function sizeRow() {
    const label = document.createElement("div");
    label.className = "rte-format-row-label";
    label.textContent = "크기";
    const row = document.createElement("div");
    row.className = "rte-format-row";
    [
      ["작게", "14px"],
      ["보통", null],
      ["크게", "24px"],
      ["아주 크게", "30px"],
    ].forEach(([text, size]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "rte-format-opt";
      b.textContent = text;
      b.addEventListener("mousedown", (e) => e.preventDefault());
      b.addEventListener("click", () => {
        if (size) editor.chain().focus().setFontSize(size).run();
        else editor.chain().focus().unsetFontSize().run();
      });
      row.appendChild(b);
    });
    const customRow = document.createElement("div");
    customRow.className = "rte-format-row";
    customRow.style.marginTop = "6px";
    const input = document.createElement("input");
    input.type = "number";
    input.min = "8";
    input.max = "96";
    input.placeholder = "직접 입력(px)";
    const applyBtn = document.createElement("button");
    applyBtn.type = "button";
    applyBtn.className = "rte-format-opt";
    applyBtn.textContent = "적용";
    applyBtn.addEventListener("mousedown", (e) => e.preventDefault());
    applyBtn.addEventListener("click", () => {
      let n = Math.round(Number(input.value));
      if (!n || Number.isNaN(n)) return;
      n = Math.max(8, Math.min(96, n));
      input.value = String(n);
      editor.chain().focus().setFontSize(n + "px").run();
    });
    customRow.append(input, applyBtn);
    return [label, row, customRow];
  }

  function swatchRow(labelText, colors, apply) {
    const label = document.createElement("div");
    label.className = "rte-format-row-label";
    label.textContent = labelText;
    const row = document.createElement("div");
    row.className = "rte-format-row";
    colors.forEach((c) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "rte-swatch" + (c.value ? "" : " is-reset");
      b.title = c.label;
      if (c.value) b.style.background = c.value;
      else b.textContent = "✕";
      b.addEventListener("mousedown", (e) => e.preventDefault());
      b.addEventListener("click", () => apply(c.value));
      row.appendChild(b);
    });
    return [label, row];
  }

  sizeRow().forEach((n) => panel.appendChild(n));
  swatchRow("글자색", TEXT_COLORS, (value) => {
    if (value) editor.chain().focus().setColor(value).run();
    else editor.chain().focus().unsetColor().run();
  }).forEach((n) => panel.appendChild(n));
  swatchRow("형광펜", HIGHLIGHT_COLORS, (value) => {
    if (value) editor.chain().focus().toggleHighlight({ color: value }).run();
    else editor.chain().focus().unsetHighlight().run();
  }).forEach((n) => panel.appendChild(n));

  function updateActiveStates() {
    buttons.bold.classList.toggle("is-active", editor.isActive("bold"));
    buttons.italic.classList.toggle("is-active", editor.isActive("italic"));
    buttons.underline.classList.toggle("is-active", editor.isActive("underline"));
    buttons.strike.classList.toggle("is-active", editor.isActive("strike"));
    buttons.code.classList.toggle("is-active", editor.isActive("code"));
    buttons.link.classList.toggle("is-active", editor.isActive("link"));
  }

  function coordsForRange(ed, from, to) {
    const start = ed.view.coordsAtPos(from);
    const end = ed.view.coordsAtPos(to);
    return {
      left: Math.min(start.left, end.left),
      right: Math.max(start.right, end.right),
      top: Math.min(start.top, end.top),
      bottom: Math.max(start.bottom, end.bottom),
    };
  }

  function updatePosition() {
    const { from, to, empty } = editor.state.selection;
    if (empty || editor.state.selection.$from.parent.type.name === "codeBlock") {
      el.hidden = true;
      panel.hidden = true;
      return;
    }
    const rect = coordsForRange(editor, from, to);
    el.hidden = false;
    updateActiveStates();
    const menuRect = el.getBoundingClientRect();
    let left = (rect.left + rect.right) / 2 - menuRect.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - menuRect.width - 8));
    let top = rect.top - menuRect.height - 10;
    if (top < 4) top = rect.bottom + 10;
    el.style.left = left + "px";
    el.style.top = top + "px";
  }

  editor.on("selectionUpdate", updatePosition);
  editor.on("transaction", updatePosition);
  document.addEventListener("mousedown", (e) => {
    if (!el.contains(e.target)) panel.hidden = true;
  });

  document.body.appendChild(el);
  return { el, updatePosition };
}
