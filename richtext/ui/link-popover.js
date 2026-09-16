/**
 * 링크 입력/수정용 작은 팝오버. 두 가지 모드로 연다:
 *  - openForSelection(editor, rect): 텍스트를 선택한 상태에서 새 링크를 붙임
 *  - openForExistingLink(editor, rect, href, pos): 이미 있는 링크를 클릭했을 때
 *    URL 미리보기 + 수정/제거/열기
 */
export function createLinkPopover(editor) {
  const el = document.createElement("div");
  el.className = "rte-link-popover";
  el.hidden = true;
  document.body.appendChild(el);

  function positionAt(rect) {
    el.style.visibility = "hidden";
    el.hidden = false;
    requestAnimationFrame(() => {
      const menuRect = el.getBoundingClientRect();
      let left = rect.left;
      left = Math.max(8, Math.min(left, window.innerWidth - menuRect.width - 8));
      let top = rect.bottom + 8;
      el.style.left = left + "px";
      el.style.top = top + "px";
      el.style.visibility = "visible";
    });
  }

  function close() {
    el.hidden = true;
    el.innerHTML = "";
  }

  function openForSelection(rect) {
    el.innerHTML = "";
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Paste or type a link";
    input.className = "rte-link-input";
    el.appendChild(input);
    positionAt(rect);
    input.focus();
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const url = input.value.trim();
        if (url) editor.chain().focus().extendMarkRange("link").setLink({ href: normalizeUrl(url) }).run();
        close();
      } else if (e.key === "Escape") {
        close();
        editor.commands.focus();
      }
    });
  }

  function openForExistingLink(rect, href) {
    el.innerHTML = "";
    const preview = document.createElement("div");
    preview.className = "rte-link-preview";
    preview.textContent = href;
    const row = document.createElement("div");
    row.className = "rte-link-actions";
    const openBtn = mkBtn("열기", () => window.open(href, "_blank", "noopener"));
    const editBtn = mkBtn("수정", () => {
      el.innerHTML = "";
      const input = document.createElement("input");
      input.type = "text";
      input.className = "rte-link-input";
      input.value = href;
      el.appendChild(input);
      input.focus();
      input.select();
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const url = input.value.trim();
          if (url) editor.chain().focus().extendMarkRange("link").setLink({ href: normalizeUrl(url) }).run();
          close();
        } else if (e.key === "Escape") {
          close();
        }
      });
    });
    const removeBtn = mkBtn("제거", () => {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      close();
    });
    row.append(openBtn, editBtn, removeBtn);
    el.append(preview, row);
    positionAt(rect);
  }

  function mkBtn(label, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "rte-link-action-btn";
    b.textContent = label;
    b.addEventListener("mousedown", (e) => e.preventDefault());
    b.addEventListener("click", onClick);
    return b;
  }

  document.addEventListener("mousedown", (e) => {
    if (!el.hidden && !el.contains(e.target)) close();
  });

  return { openForSelection, openForExistingLink, close, el };
}

function normalizeUrl(url) {
  if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url)) return url;
  return "https://" + url;
}
