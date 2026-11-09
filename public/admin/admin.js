// ══════════════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════════════
let adminToken = sessionStorage.getItem("adminToken") || "";
let kickTarget    = "";
let editMsgTarget = ""; // id of message being edited
let autoRefreshTimer = null;

// ══════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════
window.addEventListener("DOMContentLoaded", () => {
  if (adminToken) {
    showDashboard();
  }
  document.getElementById("passInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") doLogin();
  });
});

// ══════════════════════════════════════════════════════════
//  LOGIN / LOGOUT
// ══════════════════════════════════════════════════════════
async function doLogin() {
  const pass = document.getElementById("passInput").value.trim();
  if (!pass) return;

  // Test the token against API
  const res = await apiFetch("/api/admin/stats", "GET", null, pass);
  if (res.error === "Unauthorized" || res._err) {
    document.getElementById("loginErr").textContent = "❌ Galat password!";
    return;
  }
  adminToken = pass;
  sessionStorage.setItem("adminToken", pass);
  showDashboard();
}

function doLogout() {
  adminToken = "";
  sessionStorage.removeItem("adminToken");
  clearInterval(autoRefreshTimer);
  document.getElementById("dashboard").classList.add("hidden");
  document.getElementById("loginScreen").classList.remove("hidden");
  document.getElementById("passInput").value = "";
}

function showDashboard() {
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("dashboard").classList.remove("hidden");
  refreshAll();
  // Auto-refresh every 10 seconds
  clearInterval(autoRefreshTimer);
  autoRefreshTimer = setInterval(refreshAll, 10000);
}

// ══════════════════════════════════════════════════════════
//  TAB SWITCHING
// ══════════════════════════════════════════════════════════
const TAB_TITLES = {
  overview: "Overview",
  users:    "Active Users",
  reserved: "Reserved Names",
  messages: "Messages Monitor",
  codes:    "Secret Codes",
};

function switchTab(tab, btn) {
  document.querySelectorAll(".tab-content").forEach((t) => t.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
  document.getElementById("tab-" + tab).classList.add("active");
  btn.classList.add("active");
  document.getElementById("tabTitle").textContent = TAB_TITLES[tab];
  refreshAll();
}

// ══════════════════════════════════════════════════════════
//  REFRESH ALL DATA
// ══════════════════════════════════════════════════════════
async function refreshAll() {
  await Promise.all([
    loadStats(),
    loadUsers(),
    loadReserved(),
    loadMessages(),
    loadCodes(),
  ]);
}

// ══════════════════════════════════════════════════════════
//  STATS
// ══════════════════════════════════════════════════════════
async function loadStats() {
  const data = await apiFetch("/api/admin/stats");
  if (data._err) {
    document.getElementById("serverStatus").textContent = "● Offline";
    document.getElementById("serverStatus").className = "server-status offline";
    return;
  }
  document.getElementById("serverStatus").textContent = "● Online";
  document.getElementById("serverStatus").className = "server-status";
  document.getElementById("stat-users").textContent    = data.activeUsers    || 0;
  document.getElementById("stat-msgs").textContent     = data.totalMessages  || 0;
  document.getElementById("stat-reserved").textContent = data.reservedCount  || 0;
  document.getElementById("stat-uptime").textContent   = data.uptime         || "--";
  document.getElementById("uptimeBadge").textContent   = "⏱ " + (data.uptime || "--");
}

// ══════════════════════════════════════════════════════════
//  ACTIVE USERS
// ══════════════════════════════════════════════════════════
async function loadUsers() {
  const users = await apiFetch("/api/admin/users");
  if (!Array.isArray(users)) return;

  document.getElementById("usersCount").textContent = users.length;

  // Online pills on overview tab
  const pills = document.getElementById("onlinePreview");
  pills.innerHTML = users.length
    ? users.map((u) => `<span class="online-pill">${esc(u.username)}</span>`).join("")
    : `<span style="color:var(--muted);font-size:13px">Koi online nahi</span>`;

  // Users table
  const tbody = document.getElementById("usersBody");
  if (!users.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-row">Koi user online nahi</td></tr>`;
    return;
  }
  tbody.innerHTML = users.map((u, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${esc(u.username)}</strong></td>
      <td>${fmtTime(u.joinedAt)}</td>
      <td>${timeAgo(u.lastActive)}</td>
      <td><span style="color:var(--accent2);font-weight:600">${u.messageCount}</span></td>
      <td style="color:var(--muted);font-size:12px">${esc(u.ip || "--")}</td>
      <td>
        <button class="kick-btn" onclick="openKickModal('${esc(u.username)}')">
          👢 Kick
        </button>
      </td>
    </tr>
  `).join("");
}

// ══════════════════════════════════════════════════════════
//  RESERVED NAMES
// ══════════════════════════════════════════════════════════
async function loadReserved() {
  const names = await apiFetch("/api/admin/reserved");
  if (!Array.isArray(names)) return;

  document.getElementById("reservedCount").textContent = names.length;

  const tbody = document.getElementById("reservedBody");
  if (!names.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-row">Koi reserved naam nahi</td></tr>`;
    return;
  }
  tbody.innerHTML = names.map((n, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong style="color:var(--red)">${esc(n.name)}</strong></td>
      <td style="color:var(--muted)">${esc(n.note || "—")}</td>
      <td style="font-size:12px;color:var(--muted)">${fmtDate(n.addedAt)}</td>
      <td>
        <button class="del-name-btn" onclick="deleteReserved('${esc(n.name)}')">
          🗑 Delete
        </button>
      </td>
    </tr>
  `).join("");
}

async function addReserved() {
  const name = document.getElementById("resNameInput").value.trim();
  const note = document.getElementById("resNoteInput").value.trim();
  if (!name) return showToast("Naam enter karein!", "error");

  const res = await apiFetch("/api/admin/reserved", "POST", { name, note });
  if (res.success) {
    showToast(`✅ "${name}" reserved ho gaya!`, "success");
    document.getElementById("resNameInput").value = "";
    document.getElementById("resNoteInput").value = "";
    loadReserved();
    loadStats();
  } else {
    showToast("❌ " + (res.error || "Error"), "error");
  }
}

async function deleteReserved(name) {
  if (!confirm(`"${name}" ko reserved list se hatayen?`)) return;
  const res = await apiFetch(`/api/admin/reserved/${encodeURIComponent(name)}`, "DELETE");
  if (res.success) {
    showToast(`🗑️ "${name}" remove ho gaya!`, "warning");
    loadReserved();
    loadStats();
  } else {
    showToast("❌ Error", "error");
  }
}

// ══════════════════════════════════════════════════════════
//  MESSAGES
// ══════════════════════════════════════════════════════════
async function loadMessages() {
  const msgs = await apiFetch("/api/admin/messages");
  if (!Array.isArray(msgs)) return;

  const list = document.getElementById("msgList");
  if (!msgs.length) {
    list.innerHTML = `<div style="text-align:center;color:var(--muted);padding:32px">No messages</div>`;
    return;
  }
  list.innerHTML = msgs.map((m) => {
    let content = "";
    if (m.text)
      content = `<div class="msg-txt">${esc(m.text)}${m.edited ? ' <span style="color:var(--muted);font-size:11px;font-style:italic">(edited)</span>' : ''}</div>`;
    else if (m.mediaType === "image")
      content = `<img class="msg-media-thumb" src="${m.mediaUrl}" alt="img"/>`;
    else if (m.mediaType === "video")
      content = `<div class="msg-txt">🎥 Video</div>`;
    else if (m.mediaType === "audio")
      content = `<div class="msg-txt">🎤 Voice Message</div>`;

    const editBtn = m.text
      ? `<button class="edit-msg-btn" onclick="openEditMsgModal('${esc(m.id)}','${esc(m.text.replace(/'/g,"&#39;"))}')">✏️ Edit</button>`
      : "";

    return `
      <div class="msg-item" id="msgitem-${esc(m.id)}">
        <div class="msg-avatar">${esc((m.username||"?")[0].toUpperCase())}</div>
        <div class="msg-body">
          <div class="msg-meta">
            <span class="msg-user">${esc(m.username)}</span>
            <span class="msg-time-sm">${m.time || ""}</span>
          </div>
          ${content}
        </div>
        <div class="msg-item-actions">
          ${editBtn}
          <button class="del-msg-btn" onclick="adminDeleteMsg('${esc(m.id)}')">🗑️ Delete</button>
        </div>
      </div>
    `;
  }).join("");
}

async function clearAllMessages() {
  if (!confirm("Delete ALL chats? This cannot be undone!")) return;
  const res = await apiFetch("/api/admin/messages", "DELETE");
  if (res.success) {
    showToast("🗑️ All chats deleted!", "warning");
    loadMessages();
    loadStats();
  } else {
    showToast("❌ Error", "error");
  }
}

// ══════════════════════════════════════════════════════════
//  ADMIN — EDIT SINGLE MESSAGE
// ══════════════════════════════════════════════════════════
function openEditMsgModal(id, currentText) {
  editMsgTarget = id;
  document.getElementById("editMsgText").value = currentText;
  document.getElementById("editMsgModal").classList.remove("hidden");
  setTimeout(() => document.getElementById("editMsgText").focus(), 100);
}

function closeEditMsgModal() {
  editMsgTarget = "";
  document.getElementById("editMsgModal").classList.add("hidden");
}

async function confirmEditMsg() {
  if (!editMsgTarget) return;
  const text = document.getElementById("editMsgText").value.trim();
  if (!text) { showToast("Text cannot be empty!", "error"); return; }

  const res = await apiFetch(`/api/admin/message/${encodeURIComponent(editMsgTarget)}`, "PUT", { text });
  if (res.success) {
    showToast("✅ Message updated!", "success");
    closeEditMsgModal();
    loadMessages();
  } else {
    showToast("❌ " + (res.error || "Error"), "error");
  }
}

// ══════════════════════════════════════════════════════════
//  ADMIN — DELETE SINGLE MESSAGE
// ══════════════════════════════════════════════════════════
async function adminDeleteMsg(id) {
  if (!confirm("Delete this message?")) return;
  const res = await apiFetch(`/api/admin/message/${encodeURIComponent(id)}`, "DELETE");
  if (res.success) {
    showToast("🗑️ Message deleted!", "warning");
    // Remove from UI immediately
    const el = document.getElementById("msgitem-" + id);
    if (el) el.remove();
  } else {
    showToast("❌ " + (res.error || "Error"), "error");
  }
}

// ══════════════════════════════════════════════════════════
//  KICK USER
// ══════════════════════════════════════════════════════════
function openKickModal(username) {
  kickTarget = username;
  document.getElementById("kickUsername").textContent = username;
  document.getElementById("kickReason").value = "Admin ne aapko room se hata diya!";
  document.getElementById("kickModal").classList.remove("hidden");
}

function closeKickModal() {
  kickTarget = "";
  document.getElementById("kickModal").classList.add("hidden");
}

async function confirmKick() {
  if (!kickTarget) return;
  const reason = document.getElementById("kickReason").value.trim();
  const res = await apiFetch(`/api/admin/kick/${encodeURIComponent(kickTarget)}`, "POST", { reason });
  if (res.success) {
    showToast(`👢 "${kickTarget}" ko kick kar diya gaya!`, "warning");
    closeKickModal();
    setTimeout(loadUsers, 1000);
  } else {
    showToast("❌ " + (res.error || "Error"), "error");
  }
}

// ══════════════════════════════════════════════════════════
//  API HELPER
// ══════════════════════════════════════════════════════════
async function apiFetch(url, method = "GET", body = null, token = null) {
  try {
    const opts = {
      method,
      headers: { "x-admin-token": token || adminToken },
    };
    if (body) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    const res  = await fetch(url, opts);
    const data = await res.json();
    return data;
  } catch (e) {
    return { _err: true, error: e.message };
  }
}

// ══════════════════════════════════════════════════════════
//  SECRET CODES
// ══════════════════════════════════════════════════════════
async function loadCodes() {
  const data = await apiFetch("/api/admin/codes");
  if (data._err) return;
  // Fill inputs
  const rEl = document.getElementById("codeReal");
  const dEl = document.getElementById("codeDel");
  const gEl = document.getElementById("codeGhost");
  if (rEl) rEl.value = data.realChat  || "";
  if (dEl) dEl.value = data.deleteAll || "";
  if (gEl) gEl.value = data.ghostRoom || "";
  // Update display
  const dR = document.getElementById("displayReal");
  const dD = document.getElementById("displayDel");
  const dG = document.getElementById("displayGhost");
  if (dR) dR.textContent = data.realChat  || "----";
  if (dD) dD.textContent = data.deleteAll || "----";
  if (dG) dG.textContent = data.ghostRoom || "----";
}

async function saveCodes() {
  const realChat  = (document.getElementById("codeReal").value  || "").trim();
  const deleteAll = (document.getElementById("codeDel").value   || "").trim();
  const ghostRoom = (document.getElementById("codeGhost").value || "").trim();
  if (!realChat || !deleteAll || !ghostRoom)
    return showToast("❌ All 3 codes are required!", "error");
  if (realChat === deleteAll || deleteAll === ghostRoom || realChat === ghostRoom)
    return showToast("❌ All codes must be different!", "error");
  const res = await apiFetch("/api/admin/codes", "PUT", { realChat, deleteAll, ghostRoom });
  if (res.success) {
    showToast("✅ Codes updated successfully!", "success");
    loadCodes();
  } else {
    showToast("❌ " + (res.error || "Error saving codes"), "error");
  }
}

// ══════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════
function esc(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function fmtTime(dt) {
  if (!dt) return "--";
  const d = new Date(dt);
  return d.toLocaleTimeString("en-PK", { hour:"2-digit", minute:"2-digit", hour12:true });
}

function fmtDate(dt) {
  if (!dt) return "--";
  const d = new Date(dt);
  return d.toLocaleDateString("en-PK") + " " + fmtTime(dt);
}

function timeAgo(dt) {
  if (!dt) return "--";
  const sec = Math.floor((Date.now() - new Date(dt).getTime()) / 1000);
  if (sec <  5)  return "Abhi";
  if (sec < 60)  return sec + "s pehle";
  if (sec < 3600) return Math.floor(sec/60) + "m pehle";
  return Math.floor(sec/3600) + "h pehle";
}

let toastTimer = null;
function showToast(msg, type = "success") {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.className   = "toast show " + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3000);
}
