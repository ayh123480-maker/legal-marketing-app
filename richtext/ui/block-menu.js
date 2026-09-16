/**
 * "⋮⋮" 핸들을 눌렀을 때 뜨는 블록 컨텍스트 메뉴: 삭제/복제/타입 변환/링크 복사/
 * 위아래로 이동.
 */
const TURN_INTO_TYPES = [
  { label: "텍스트", apply: (editor) => editor.chain().focus().setNode("paragraph").run() },
  { label: "제목 1", apply: (editor) => editor.chain().focus().setNode("heading", { level: 2 }).run() },
  { label: "제목 2", apply: (editor) => editor.chain().focus().setNode("heading", { level: 3 }).run() },
  { label: "제목 3", apply: (editor) => editor.chain().focus().setNode("heading", { level: 4 }).run() },
  { label: "글머리 기호 목록", apply: (editor) => editor.chain().focus().toggleBulletList().run() },
  { label: "번호 매기기 목록", apply: (editor) => editor.chain().focus().toggleOrderedList().run() },
  { label: "할 일 목록", apply: (editor) => editor.chain().focus().toggleTaskList().run() },
  { label: "인용", apply: (editor) => editor.chain().focus().toggleBlockquote().run() },
];

export function createBlockMenu(editor) {
  const el = document.createElement("div");
  el.className = "rte-block-menu";
  el.hidden = true;
  document.body.appendChild(el);

  let activePos = null;

  function close() {
    el.hidden = true;
    el.innerHTML = "";
  }

  function selectBlock(pos) {
    const node = editor.state.doc.nodeAt(pos);
    if (!node) return;
    editor.commands.setTextSelection({ from: pos + 1, to: pos + node.nodeSize - 1 });
  }

  function row(label, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "rte-block-menu-item";
    b.textContent = label;
    b.addEventListener("mousedown", (e) => e.preventDefault());
    b.addEventListener("click", () => {
      onClick();
      close();
    });
    return b;
  }

  function divider() {
    const d = document.createElement("div");
    d.className = "rte-block-menu-divider";
    return d;
  }

  function open(pos, rect) {
    activePos = pos;
    el.innerHTML = "";

    el.appendChild(
      row("삭제", () => {
        const node = editor.state.doc.nodeAt(activePos);
        if (!node) return;
        editor.chain().focus().deleteRange({ from: activePos, to: activePos + node.nodeSize }).run();
      })
    );
    el.appendChild(
      row("복제", () => {
        const node = editor.state.doc.nodeAt(activePos);
        if (!node) return;
        const tr = editor.state.tr.insert(activePos + node.nodeSize, node.copy(node.content));
        editor.view.dispatch(tr);
      })
    );
    el.appendChild(divider());

    const turnInto = document.createElement("div");
    turnInto.className = "rte-block-menu-label";
    turnInto.textContent = "다음으로 바꾸기";
    el.appendChild(turnInto);
    TURN_INTO_TYPES.forEach((t) => {
      el.appendChild(
        row(t.label, () => {
          selectBlock(activePos);
          t.apply(editor);
        })
      );
    });
    el.appendChild(divider());

    el.appendChild(
      row("위로 이동", () => {
        moveBlock(editor, activePos, -1);
      })
    );
    el.appendChild(
      row("아래로 이동", () => {
        moveBlock(editor, activePos, 1);
      })
    );
    el.appendChild(
      row("블록 링크 복사", () => {
        const url = new URL(window.location.href);
        url.hash = "block-" + activePos;
        navigator.clipboard && navigator.clipboard.writeText(url.toString()).catch(() => {});
      })
    );

    el.style.visibility = "hidden";
    el.hidden = false;
    requestAnimationFrame(() => {
      const menuRect = el.getBoundingClientRect();
      let left = rect.left;
      left = Math.max(8, Math.min(left, window.innerWidth - menuRect.width - 8));
      let top = rect.bottom + 4;
      if (top + menuRect.height > window.innerHeight - 8) top = rect.top - menuRect.height - 4;
      el.style.left = left + "px";
      el.style.top = top + "px";
      el.style.visibility = "visible";
    });
  }

  document.addEventListener("mousedown", (e) => {
    if (!el.hidden && !el.contains(e.target)) close();
  });

  return { open, close, get isOpen() { return !el.hidden; } };
}

/** direction: -1(위로) | 1(아래로) — 최상위 블록만 대상으로 한다 */
export function moveBlock(editor, pos, direction) {
  const { doc } = editor.state;
  const node = doc.nodeAt(pos);
  if (!node) return;
  const nodeSize = node.nodeSize;

  if (direction < 0) {
    if (pos === 0) return;
    const beforeNode = doc.resolve(pos).nodeBefore;
    if (!beforeNode) return;
    const beforeStart = pos - beforeNode.nodeSize;
    const tr = editor.state.tr.delete(pos, pos + nodeSize).insert(beforeStart, node);
    editor.view.dispatch(tr);
  } else {
    const afterPos = pos + nodeSize;
    const afterNode = doc.nodeAt(afterPos);
    if (!afterNode) return;
    const afterEnd = afterPos + afterNode.nodeSize;
    const tr = editor.state.tr.insert(afterEnd, node).delete(pos, pos + nodeSize);
    editor.view.dispatch(tr);
  }
}
