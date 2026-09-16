import { createBlockItems } from "../commands/block-items.js";

/**
 * "+" 블록 추가 버튼이 쓰는 독립 실행형 메뉴 — command-menu.js와 같은 목록/외형을
 * 쓰지만 @tiptap/suggestion의 "/" 트리거에 묶이지 않고 원하는 좌표에 바로 띄운다.
 */
export function createCommandMenuStandalone({ openImagePanel }) {
  const items = createBlockItems({ openImagePanel });
  const root = document.createElement("div");
  root.className = "rte-slash-menu";
  root.hidden = true;
  document.body.appendChild(root);

  let selectedIndex = 0;
  let onPick = null;

  function render() {
    root.innerHTML = "";
    items.forEach((item, idx) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "rte-slash-item" + (idx === selectedIndex ? " is-selected" : "");
      const icon = document.createElement("span");
      icon.className = "rte-slash-icon";
      icon.textContent = item.icon;
      const text = document.createElement("span");
      text.className = "rte-slash-text";
      const title = document.createElement("span");
      title.className = "rte-slash-title";
      title.textContent = item.title;
      const desc = document.createElement("span");
      desc.className = "rte-slash-desc";
      desc.textContent = item.description;
      text.append(title, desc);
      row.append(icon, text);
      row.addEventListener("mousedown", (e) => {
        e.preventDefault();
        pick(item);
      });
      root.appendChild(row);
    });
  }

  function pick(item) {
    close();
    if (onPick) onPick(item);
  }

  function close() {
    root.hidden = true;
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("mousedown", onOutsideClick, true);
  }

  function onOutsideClick(e) {
    if (!root.contains(e.target)) close();
  }

  function onKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % items.length;
      render();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIndex = (selectedIndex - 1 + items.length) % items.length;
      render();
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(items[selectedIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }

  function openAt(rect, callback) {
    selectedIndex = 0;
    onPick = callback;
    render();
    root.hidden = false;
    root.style.visibility = "hidden";
    requestAnimationFrame(() => {
      const menuRect = root.getBoundingClientRect();
      let left = rect.left;
      left = Math.max(8, Math.min(left, window.innerWidth - menuRect.width - 8));
      let top = rect.bottom + 6;
      if (top + menuRect.height > window.innerHeight - 8) top = rect.top - menuRect.height - 6;
      root.style.left = left + "px";
      root.style.top = Math.max(8, top) + "px";
      root.style.visibility = "visible";
    });
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("mousedown", onOutsideClick, true);
  }

  return { openAt, hidden: () => root.hidden };
}
