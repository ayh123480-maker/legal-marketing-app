/**
 * 이미지 삽입 패널 — 파일 업로드 / 클립보드 붙여넣기 안내 / 서버 프록시를 통한
 * 이미지 검색(api/image-search.js, api/image-fetch.js — Openverse를 브라우저가
 * 직접 호출하면 사용자 네트워크에 따라 타임아웃 나는 문제가 있어서 서버가 대신함).
 * insertImage(dataUrl) 콜백만 받아서 실제 삽입 방식(Tiptap 명령)과는 분리돼 있다.
 */
export function createImagePanel({ insertImage }) {
  const backdrop = document.createElement("div");
  backdrop.className = "rte-image-panel-backdrop";
  backdrop.hidden = true;

  const panel = document.createElement("div");
  panel.className = "rte-image-panel";
  backdrop.appendChild(panel);

  const title = document.createElement("h3");
  title.textContent = "이미지 삽입";
  panel.appendChild(title);

  const uploadBtn = document.createElement("button");
  uploadBtn.type = "button";
  uploadBtn.className = "rte-image-panel-upload";
  uploadBtn.textContent = "💻 내 컴퓨터에서 선택";
  panel.appendChild(uploadBtn);

  const hint = document.createElement("p");
  hint.className = "rte-image-panel-hint";
  hint.textContent = "본문에 붙여넣기(Ctrl/Cmd+V)로 클립보드 이미지를 바로 넣을 수도 있어요.";
  panel.appendChild(hint);

  const searchRow = document.createElement("div");
  searchRow.className = "rte-image-search-row";
  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "이미지 검색어 (예: 계약서, 법정)";
  const searchBtn = document.createElement("button");
  searchBtn.type = "button";
  searchBtn.textContent = "검색";
  searchRow.append(searchInput, searchBtn);
  panel.appendChild(searchRow);

  const status = document.createElement("div");
  status.className = "rte-image-search-status";
  panel.appendChild(status);

  const results = document.createElement("div");
  results.className = "rte-image-search-results";
  panel.appendChild(results);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "rte-image-panel-close";
  closeBtn.textContent = "닫기";
  panel.appendChild(closeBtn);

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.hidden = true;
  document.body.appendChild(fileInput);

  function close() {
    backdrop.hidden = true;
  }
  function open() {
    status.textContent = "";
    results.innerHTML = "";
    searchInput.value = "";
    backdrop.hidden = false;
  }

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });
  closeBtn.addEventListener("click", close);
  uploadBtn.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = "";
    if (!file) return;
    resizeImageFile(file)
      .then((dataUrl) => {
        insertImage(dataUrl);
        close();
      })
      .catch((e) => {
        status.textContent = e.message;
      });
  });

  function fetchImageAsDataUrl(url) {
    return fetch("/api/image-fetch?url=" + encodeURIComponent(url), { credentials: "same-origin" }).then((res) =>
      res.json().then((data) => {
        if (!res.ok) throw new Error(data.error || "이미지를 가져오지 못했어요.");
        return data.dataUrl;
      })
    );
  }

  function runSearch() {
    const query = searchInput.value.trim();
    if (!query) return;
    status.textContent = "검색하는 중...";
    results.innerHTML = "";
    fetch("/api/image-search?q=" + encodeURIComponent(query), { credentials: "same-origin" })
      .then((res) => {
        if (res.status === 401) throw new Error("로그인이 만료됐어요. 마케팅 툴에 다시 로그인한 뒤 시도해주세요.");
        return res.json().then((data) => {
          if (!res.ok) throw new Error(data.error || "검색에 실패했어요.");
          return data;
        });
      })
      .then((data) => {
        const items = data.results || [];
        if (!items.length) {
          status.textContent = "검색 결과가 없어요. 다른 검색어로 시도해보세요.";
          return;
        }
        status.textContent = "";
        items.forEach((r) => {
          const thumb = document.createElement("img");
          thumb.src = r.thumb;
          thumb.loading = "lazy";
          thumb.addEventListener("click", () => {
            status.textContent = "이미지를 가져오는 중...";
            fetchImageAsDataUrl(r.full)
              .then((dataUrl) => {
                insertImage(dataUrl);
                close();
              })
              .catch((e) => {
                status.textContent = e.message;
              });
          });
          results.appendChild(thumb);
        });
      })
      .catch((e) => {
        status.textContent = "이미지 검색에 실패했어요 (" + e.message + "). 잠시 후 다시 시도하거나 \"내 컴퓨터에서 선택\"을 이용해주세요.";
      });
  }
  searchBtn.addEventListener("click", runSearch);
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") runSearch();
  });

  document.body.appendChild(backdrop);
  return { open, close, el: backdrop };
}

export function resizeImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxW = 1280;
        const scale = Math.min(1, maxW / img.naturalWidth);
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => reject(new Error("이미지를 불러오지 못했어요."));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("파일을 읽지 못했어요."));
    reader.readAsDataURL(file);
  });
}
