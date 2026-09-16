/**
 * "/" 슬래시 메뉴의 실제 렌더링. @tiptap/suggestion이 기대하는 render() 라이프사이클
 * ({ onStart, onUpdate, onKeyDown, onExit })을 구현한다 — Tiptap 공식 문서의 멘션/
 * 슬래시 커맨드 패턴과 동일한 형태.
 */
export function createCommandMenu() {
  let root = null;
  let selectedIndex = 0;
  let currentItems = [];
  let currentCommand = null;

  function renderList() {
    root.innerHTML = "";
    if (!currentItems.length) {
      const empty = document.createElement("div");
      empty.className = "rte-slash-empty";
      empty.textContent = "일치하는 명령이 없어요";
      root.appendChild(empty);
      return;
    }
    currentItems.forEach((item, idx) => {
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
        currentCommand(item);
      });
      root.appendChild(row);
    });
  }

  function position(clientRect) {
    if (!root || !clientRect) return;
    const rect = clientRect();
    if (!rect) return;
    root.style.visibility = "hidden";
    root.style.left = "0px";
    root.style.top = "0px";
    requestAnimationFrame(() => {
      if (!root) return;
      const menuRect = root.getBoundingClientRect();
      let left = rect.left;
      if (left + menuRect.width > window.innerWidth - 12) left = window.innerWidth - menuRect.width - 12;
      left = Math.max(8, left);
      let top = rect.bottom + 6;
      if (top + menuRect.height > window.innerHeight - 12) top = rect.top - menuRect.height - 6;
      root.style.left = left + "px";
      root.style.top = Math.max(8, top) + "px";
      root.style.visibility = "visible";
    });
  }

  return {
    onStart(props) {
      selectedIndex = 0;
      currentItems = props.items;
      currentCommand = props.command;
      root = document.createElement("div");
      root.className = "rte-slash-menu";
      document.body.appendChild(root);
      renderList();
      position(props.clientRect);
    },
    onUpdate(props) {
      selectedIndex = 0;
      currentItems = props.items;
      currentCommand = props.command;
      renderList();
      position(props.clientRect);
    },
    onKeyDown(props) {
      if (!root) return false;
      if (props.event.key === "ArrowDown") {
        selectedIndex = (selectedIndex + 1) % Math.max(1, currentItems.length);
        renderList();
        return true;
      }
      if (props.event.key === "ArrowUp") {
        selectedIndex = (selectedIndex - 1 + currentItems.length) % Math.max(1, currentItems.length);
        renderList();
        return true;
      }
      if (props.event.key === "Enter") {
        if (currentItems[selectedIndex]) currentCommand(currentItems[selectedIndex]);
        return true;
      }
      if (props.event.key === "Escape") {
        return true;
      }
      return false;
    },
    onExit() {
      if (root && root.parentNode) root.parentNode.removeChild(root);
      root = null;
      currentItems = [];
    },
  };
}
