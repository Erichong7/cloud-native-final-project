// 모든 요청은 같은 주소의 /api 로 보낸다 → Ingress가 백엔드 Service로 라우팅
const API = "/api/posts";

const $ = (id) => document.getElementById(id);
const form = $("post-form");
let posts = [];
let currentId = null;

// ---------- 공통 ----------
async function request(url, options = {}) {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...options });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `요청 실패 (${res.status})`);
  return data;
}

function showMessage(text, isError = false) {
  $("message").textContent = text;
  $("message").className = isError ? "error" : "ok";
  if (!isError) setTimeout(() => { if ($("message").textContent === text) $("message").textContent = ""; }, 2500);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// "방금", "5분 전", "오늘 14:03" 대신 커뮤니티 앱처럼 짧게 표시
function timeAgo(iso) {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "방금";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  const pad = (n) => String(n).padStart(2, "0");
  const sameDay = new Date().toDateString() === d.toDateString();
  return sameDay
    ? `${pad(d.getHours())}:${pad(d.getMinutes())}`
    : `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const isEdited = (p) => p.updated_at !== p.created_at;

// ---------- 목록 ----------
async function loadPosts() {
  try {
    posts = await request(API);
  } catch (e) {
    showMessage(`목록을 불러오지 못했습니다: ${e.message}`, true);
    return;
  }
  renderList();
  renderSide();
}

function renderList() {
  const list = $("post-list");
  if (posts.length === 0) {
    list.innerHTML = '<li class="empty">아직 글이 없어요. 첫 글을 남겨보세요!</li>';
    return;
  }
  list.innerHTML = posts.map((p) => `
    <li>
      <button class="post-row" data-id="${p.id}">
        <h4>${escapeHtml(p.title)}</h4>
        <p>${escapeHtml(p.content)}</p>
        <div class="post-meta">
          <time>${timeAgo(p.created_at)}</time>
          <span>${escapeHtml(p.author)}</span>
          ${isEdited(p) ? '<span class="edited">수정됨</span>' : ""}
        </div>
      </button>
    </li>`).join("");
}

function renderSide() {
  $("post-count").textContent = posts.length;
  $("recent-list").innerHTML = posts.slice(0, 5).map((p) => `
    <li><button data-id="${p.id}">
      <span class="t">${escapeHtml(p.title)}</span>
      <span class="d">${timeAgo(p.created_at)}</span>
    </button></li>`).join("") || '<li class="empty">글 없음</li>';
}

// ---------- 상세 ----------
async function openDetail(id) {
  try {
    const p = await request(`${API}/${id}`);
    currentId = p.id;
    $("detail-author").textContent = p.author;
    $("detail-time").textContent = timeAgo(p.created_at) + (isEdited(p) ? " · 수정됨" : "");
    $("detail-title").textContent = p.title;
    $("detail-content").textContent = p.content;
    $("detail").hidden = false;
    $("list-box").hidden = true;
    closeWrite();
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (e) {
    showMessage(e.message, true);
  }
}

function closeDetail() {
  currentId = null;
  $("detail").hidden = true;
  $("list-box").hidden = false;
}

// ---------- 글쓰기 / 수정 ----------
function syncAnonymous() {
  $("author").disabled = $("anonymous").checked;
  if ($("anonymous").checked) $("author").value = "";
}

function openWrite(post = null) {
  $("open-write").hidden = true;
  form.hidden = false;
  $("post-id").value = post ? post.id : "";
  $("title").value = post ? post.title : "";
  $("content").value = post ? post.content : "";
  const anon = !post || post.author === "익명";
  $("anonymous").checked = anon;
  $("author").value = anon ? "" : post.author;
  syncAnonymous();
  $("title").focus();
}

function closeWrite() {
  form.reset();
  $("post-id").value = "";
  form.hidden = true;
  $("open-write").hidden = false;
  syncAnonymous();
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = $("post-id").value;
  const author = $("anonymous").checked ? "익명" : ($("author").value.trim() || "익명");
  const body = JSON.stringify({ title: $("title").value, content: $("content").value, author });
  try {
    if (id) {
      await request(`${API}/${id}`, { method: "PUT", body });
      showMessage("글을 수정했습니다.");
    } else {
      await request(API, { method: "POST", body });
      showMessage("글을 등록했습니다.");
    }
    closeWrite();
    closeDetail();
    loadPosts();
  } catch (err) {
    showMessage(err.message, true);
  }
});

// ---------- 이벤트 ----------
$("open-write").addEventListener("click", () => { closeDetail(); openWrite(); });
$("cancel-btn").addEventListener("click", closeWrite);
$("anonymous").addEventListener("change", syncAnonymous);
$("refresh-btn").addEventListener("click", () => { closeDetail(); loadPosts(); });
$("back-btn").addEventListener("click", closeDetail);

for (const box of [$("post-list"), $("recent-list")]) {
  box.addEventListener("click", (e) => {
    const row = e.target.closest("[data-id]");
    if (row) openDetail(row.dataset.id);
  });
}

$("edit-btn").addEventListener("click", () => {
  const p = posts.find((x) => x.id === currentId);
  if (!p) return;
  $("detail").hidden = true;
  $("list-box").hidden = false;
  openWrite(p);
});

$("delete-btn").addEventListener("click", async () => {
  if (!currentId || !confirm("이 글을 삭제할까요?")) return;
  try {
    await request(`${API}/${currentId}`, { method: "DELETE" });
    showMessage("글을 삭제했습니다.");
    closeDetail();
    loadPosts();
  } catch (err) {
    showMessage(err.message, true);
  }
});

syncAnonymous();
loadPosts();
