import { createCommandMenuStandalone } from "./command-menu-standalone.js";
import { createBlockMenu, moveBlock } from "./block-menu.js";

/**
 * 줄 왼쪽 호버 "+"(블록 추가)와 "⋮⋮"(드래그 핸들 + 컨텍스트 메뉴).
 * wrapperEl은 position:relative인 컨테이너 — 이 안에서만 좌표를 계산한다.
 *
 * 문단 사이 여백에서 호버 대상이 에디터 루트로 잡혀 핸들이 맨 위로 튕기는 문제,
 * 그리고 핸들을 음수 left로 에디터 바깥에 띄워서 마우스가 다가가는 도중
 * mouseleave가 먼저 터져 핸들이 사라지는 문제 — 둘 다 이전 리치 에디터에서
 * 실제로 겪었던 버그라, 처음부터 (1) 왼쪽에 진짜 padding 여백을 두고 그 안에
 * 버튼을 놓고 (2) 최상위 블록을 못 찾을 때는 마지막 위치를 유지하는 식으로 피한다.
 */
export function createBlockHandle(editor, wrapperEl, { openImagePanel }) {
  const plusBtn = document.createElement("button");
  plusBtn.type = "button";
  plusBtn.className = "rte-block-plus";
  plusBtn.setAttribute("aria-label", "블록 추가");
  plusBtn.hidden = true;

  const dragBtn = document.createElement("button");
  dragBtn.type = "button";
  dragBtn.className = "rte-block-drag";
  dragBtn.setAttribute("aria-label", "블록 메뉴 / 드래그로 순서 변경");
  dragBtn.draggable = true;
  dragBtn.hidden = true;
  dragBtn.textContent = "⠿";

  wrapperEl.appendChild(plusBtn);
  wrapperEl.appendChild(dragBtn);

  const dropLine = document.createElement("div");
  dropLine.className = "rte-drop-line";
  dropLine.hidden = true;
  wrapperEl.appendChild(dropLine);

  const blockMenu = createBlockMenu(editor);
  const slashMenu = createCommandMenuStandalone({ openImagePanel });

  let hoveredPos = null; // 최상위 블록의 시작 포지션

  function topLevelBlockAt(clientX, clientY) {
    const coords = editor.view.posAtCoords({ left: clientX, top: clientY });
    if (!coords) return null;
    const $pos = editor.state.doc.resolve(coords.pos);
    if ($pos.depth === 0) return null;
    return $pos.before(1);
  }

  function positionHandles(pos) {
    const dom = editor.view.nodeDOM(pos);
    const el = dom && dom.nodeType === 1 ? dom : dom && dom.parentElement;
    if (!el) return;
    const wrapperRect = wrapperEl.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    const top = rect.top - wrapperRect.top;
    plusBtn.style.top = top + "px";
    dragBtn.style.top = top + "px";
    plusBtn.hidden = false;
    dragBtn.hidden = false;
  }

  wrapperEl.addEventListener("mousemove", (e) => {
    if (draggingPos != null) return; // 드래그 중엔 호버 갱신 안 함
    const pos = topLevelBlockAt(e.clientX, e.clientY);
    if (pos == null) return; // 문단 사이 여백 등 — 마지막 위치 유지
    if (pos !== hoveredPos) {
      hoveredPos = pos;
      positionHandles(pos);
    }
  });
  wrapperEl.addEventListener("mouseleave", () => {
    if (blockMenu.isOpen || !slashMenu.hidden()) return;
    plusBtn.hidden = true;
    dragBtn.hidden = true;
  });

  plusBtn.addEventListener("mousedown", (e) => e.preventDefault());
  plusBtn.addEventListener("click", () => {
    if (hoveredPos == null) return;
    const node = editor.state.doc.nodeAt(hoveredPos);
    const insertPos = hoveredPos + (node ? node.nodeSize : 0);
    const rect = plusBtn.getBoundingClientRect();
    slashMenu.openAt(
      { left: rect.left, bottom: rect.bottom, top: rect.top },
      (item) => {
        editor.chain().focus().insertContentAt(insertPos, { type: "paragraph" }).run();
        item.command({ editor, range: { from: insertPos + 1, to: insertPos + 1 } });
      }
    );
  });

  dragBtn.addEventListener("mousedown", (e) => e.preventDefault());
  dragBtn.addEventListener("click", () => {
    if (hoveredPos == null) return;
    const rect = dragBtn.getBoundingClientRect();
    blockMenu.open(hoveredPos, { left: rect.right + 6, top: rect.top, bottom: rect.bottom });
  });

  // ---- 드래그 앤 드롭으로 블록 순서 바꾸기 ----
  let draggingPos = null;
  dragBtn.addEventListener("dragstart", (e) => {
    if (hoveredPos == null) return;
    draggingPos = hoveredPos;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", "block");
  });
  dragBtn.addEventListener("dragend", () => {
    draggingPos = null;
    dropLine.hidden = true;
  });

  wrapperEl.addEventListener("dragover", (e) => {
    if (draggingPos == null) return;
    e.preventDefault();
    const pos = topLevelBlockAt(e.clientX, e.clientY);
    if (pos == null) return;
    const dom = editor.view.nodeDOM(pos);
    const el = dom && dom.nodeType === 1 ? dom : dom && dom.parentElement;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const wrapperRect = wrapperEl.getBoundingClientRect();
    const isBelow = e.clientY > rect.top + rect.height / 2;
    const lineTop = (isBelow ? rect.bottom : rect.top) - wrapperRect.top;
    dropLine.style.top = lineTop + "px";
    dropLine.hidden = false;
    dropLine.dataset.targetPos = String(pos);
    dropLine.dataset.after = isBelow ? "1" : "0";
  });

  wrapperEl.addEventListener("drop", (e) => {
    if (draggingPos == null) return;
    e.preventDefault();
    const targetPos = Number(dropLine.dataset.targetPos);
    const after = dropLine.dataset.after === "1";
    dropLine.hidden = true;
    if (Number.isNaN(targetPos)) {
      draggingPos = null;
      return;
    }
    const node = editor.state.doc.nodeAt(draggingPos);
    if (!node) {
      draggingPos = null;
      return;
    }
    const targetNode = editor.state.doc.nodeAt(targetPos);
    if (!targetNode || targetPos === draggingPos) {
      draggingPos = null;
      return;
    }
    let insertAt = after ? targetPos + targetNode.nodeSize : targetPos;
    const tr = editor.state.tr.delete(draggingPos, draggingPos + node.nodeSize);
    if (insertAt > draggingPos) insertAt -= node.nodeSize;
    tr.insert(insertAt, node);
    editor.view.dispatch(tr);
    draggingPos = null;
  });

  return { plusBtn, dragBtn };
}
