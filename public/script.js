// ══════════════════════════════════════════════════════════
//  EMOJI DATA
// ══════════════════════════════════════════════════════════
const EMOJIS = {
  smileys:["😀","😃","😄","😁","😆","😅","😂","🤣","😊","😇","🙂","🙃","😉","😍","🥰","😘","😋","😛","😜","🤪","😎","🤩","🥳","😏","😒","😔","😟","🙁","😢","😭","😤","😠","😡","🤬","🤯","😳","😱","😨","😰","🤗","🤔","🤭","🤫","😶","😐","😬","🙄","😯","😲","🥱","😴","😵","🤢","🤮","🤧","😷","🤒","🤕"],
  hands:  ["👍","👎","👌","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","👇","☝️","👋","🤚","🖐️","✋","🖖","👏","🙌","🤲","🤝","🙏","💪","💅","🫶","🫰","🫵"],
  hearts: ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟","❤️‍🔥","💌","💋"],
  nature: ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🐔","🐧","🐦","🦆","🦅","🦉","🦋","🐌","🐞","🌸","🌺","🌻","🌼","🌷","🌱","🌿","🍀","🍃","🌲","🌳","🌴","🌵","🐬","🐳","🦈","🌈","⭐","🌟","✨","🌙","☀️","❄️","🔥"],
  food:   ["🍎","🍊","🍋","🍇","🍓","🍒","🍑","🥭","🍍","🥥","🥝","🍅","🥑","🌽","🍕","🍔","🍟","🌮","🌯","🍜","🍝","🍛","🍣","🍩","🍪","🎂","🍰","🧁","🍫","🍬","🍭","☕","🍵","🧃","🥤","🧋","🍺","🍻","🥂","🍷"],
  objects:["📱","💻","🖥️","⌨️","🖱️","📷","📸","📹","🎥","📞","☎️","📺","📻","🎵","🎶","🎤","🎧","🎸","🎹","🎺","🎮","🕹️","🎲","🎭","🎨","📚","📖","✏️","📝","📌","📎","✂️","🔑","🔒","💡","🏆","🥇","🎁","🎉","🎊","🎈","⚽","🏀","🚗","✈️","🚀"],
};

// ══════════════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════════════
const socket = io();

let myName          = "";
let isFakeRoom      = false;
let codeBuffer      = "";
let isRecording     = false;
let mediaRecorder   = null;
let audioChunks     = [];
let recInterval     = null;
let recSeconds      = 0;
let emojiOpen       = false;
let currentEmojiCat = "smileys";
let pendingMessages = [];

const ONE_HOUR = 60 * 60 * 1000; // ms

// ══════════════════════════════════════════════════════════
//  SCREEN SWITCHING
// ══════════════════════════════════════════════════════════
function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  if (document.activeElement) document.activeElement.blur();
}

// ══════════════════════════════════════════════════════════
//  SCREEN 1 — NAME
// ══════════════════════════════════════════════════════════
function submitName() {
  const input = document.getElementById("nameInput");
  const name  = input.value.trim();
  if (!name || name.length < 2) return showError("nameError", "Name must be at least 2 characters!");

  const btn = document.getElementById("nameBtn");
  btn.textContent = "Checking...";
  btn.disabled = true;

  socket.emit("set-name", name, (res) => {
    btn.disabled = false;
    btn.innerHTML = "Continue <span>→</span>";
    if (res.success) {
      myName = name;
      input.blur();
      document.getElementById("myAvatar").textContent = name[0].toUpperCase();
      showScreen("screen-code");
    } else {
      showError("nameError", res.error);
      input.focus();
      input.select();
    }
  });
}

document.getElementById("nameInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.stopPropagation(); submitName(); }
});

// ══════════════════════════════════════════════════════════
//  SCREEN 2 — CODE
// ══════════════════════════════════════════════════════════
function updateCodeDisplay() {
  const display = document.getElementById("codeDisplay");
  if (!codeBuffer) {
    display.textContent = "_ _ _ _";
    display.classList.remove("typing");
    return;
  }
  const filled = codeBuffer.replace(/./g, "●");
  const empty  = "_ ".repeat(Math.max(0, 4 - codeBuffer.length)).trim();
  display.textContent = (filled + " " + empty).trim();
  display.classList.add("typing");
}

function numPress(digit) {
  if (codeBuffer.length >= 4) return;
  codeBuffer += digit;
  updateCodeDisplay();
  if (codeBuffer.length === 4) setTimeout(submitCode, 200);
}

function numDelete() {
  codeBuffer = codeBuffer.slice(0, -1);
  updateCodeDisplay();
  document.getElementById("codeError").textContent = "";
}

function submitCode() {
  const code = codeBuffer;
  document.getElementById("codeError").textContent = "";
  if (!code) return showError("codeError", "Enter a code!");

  // Verify code with server (not hardcoded)
  socket.emit("verify-code", code, (res) => {
    if (res.action === "real") {
      isFakeRoom = false;
      openChatRoom("real");
    } else if (res.action === "delete") {
      socket.emit("delete-all");
      codeBuffer = "";
      updateCodeDisplay();
    } else if (res.action === "ghost") {
      isFakeRoom = true;
      openChatRoom("fake");
    } else {
      codeBuffer = "";
      updateCodeDisplay();
      showError("codeError", "Wrong code! Try again.");
    }
  });
}

document.addEventListener("keydown", (e) => {
  const codeScreen = document.getElementById("screen-code");
  if (!codeScreen.classList.contains("active")) return;
  if (e.key >= "0" && e.key <= "9") numPress(e.key);
  else if (e.key === "Backspace") numDelete();
  else if (e.key === "Enter") submitCode();
});

// ══════════════════════════════════════════════════════════
//  OPEN CHAT ROOM
// ══════════════════════════════════════════════════════════
function openChatRoom(type) {
  const chatScreen = document.getElementById("screen-chat");
  if (type === "real") {
    document.getElementById("roomTitle").textContent    = "Live Chat Room";
    document.getElementById("onlineStatus").textContent = "● Real-time";
    document.getElementById("onlineStatus").className   = "chat-status";
    document.getElementById("roomBadge").textContent    = "🟢 Real";
    document.getElementById("roomBadge").className      = "room-badge real";
    const w = document.getElementById("welcomeMsg");
    if (w) w.innerHTML = "<span>🔒</span> Welcome to the real chat room!";
    chatScreen.classList.remove("fake-mode");
    document.getElementById("msgInput").placeholder = "Type a message...";
  } else {
    document.getElementById("roomTitle").textContent    = "Chat Room";
    document.getElementById("onlineStatus").textContent = "● Private";
    document.getElementById("onlineStatus").className   = "chat-status fake";
    document.getElementById("roomBadge").textContent    = "👻 Ghost";
    document.getElementById("roomBadge").className      = "room-badge fake";
    const w = document.getElementById("welcomeMsg");
    if (w) w.innerHTML = "<span>👻</span> Ghost room — only you can see messages.";
    chatScreen.classList.add("fake-mode");
    document.getElementById("msgInput").placeholder = "Type a message (only you can see)...";
  }
  showScreen("screen-chat");
  document.getElementById("msgInput").focus();
  codeBuffer = "";
  updateCodeDisplay();
  renderEmojiGrid("smileys");

  if (type === "real") {
    pendingMessages.forEach((msg) => appendMessage(msg, msg.username === myName));
  }
  pendingMessages = [];
}

// ══════════════════════════════════════════════════════════
//  SEND TEXT MESSAGE
// ══════════════════════════════════════════════════════════
function sendMessage() {
  const input = document.getElementById("msgInput");
  const text  = input.value.trim();
  if (!text) return;
  input.value = "";
  closeEmoji();

  if (isFakeRoom) {
    appendMessage({ id: genId(), username: myName, text, time: getTime(), sentAt: Date.now() }, true);
    return;
  }
  socket.emit("send-message", { text });
}

// ══════════════════════════════════════════════════════════
//  FILE UPLOAD
// ══════════════════════════════════════════════════════════
async function handleFileSelect(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = "";

  if (file.size > 50 * 1024 * 1024) { showToast("File exceeds 50MB limit!", "error"); return; }
  showToast("Uploading...", "");

  const fd = new FormData();
  fd.append("file", file);
  try {
    const res  = await fetch("/upload", { method: "POST", body: fd });
    const data = await res.json();
    if (!data.url) throw new Error();
    showToast("Uploaded!", "success");
    if (isFakeRoom) {
      appendMessage({ id: genId(), username: myName, mediaUrl: data.url, mediaType: data.type, time: getTime(), sentAt: Date.now() }, true);
      return;
    }
    socket.emit("send-message", { mediaUrl: data.url, mediaType: data.type });
  } catch { showToast("Upload failed!", "error"); }
}

// ══════════════════════════════════════════════════════════
//  VOICE MESSAGE
// ══════════════════════════════════════════════════════════
async function toggleRecording() {
  isRecording ? await stopRecording() : await startRecording();
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks  = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      await uploadAudio(new Blob(audioChunks, { type: "audio/webm" }));
    };
    mediaRecorder.start();
    isRecording = true; recSeconds = 0;

    const voiceBtn  = document.getElementById("voiceBtn");
    const voiceIcon = document.getElementById("voiceIcon");
    voiceBtn.classList.add("recording");
    voiceIcon.innerHTML = `<rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor"/>`;
    document.getElementById("recordingBar").classList.remove("hidden");
    updateRecTimer();
    recInterval = setInterval(updateRecTimer, 1000);
    setTimeout(() => { if (isRecording) stopRecording(); }, 120000);
  } catch { showToast("Microphone access denied!", "error"); }
}

function updateRecTimer() {
  recSeconds++;
  const m = Math.floor(recSeconds / 60), s = recSeconds % 60;
  document.getElementById("recTimer").textContent = `${m}:${s.toString().padStart(2,"0")}`;
}

async function stopRecording() {
  if (!mediaRecorder || !isRecording) return;
  clearInterval(recInterval);
  isRecording = false;
  mediaRecorder.stop();
  const voiceBtn  = document.getElementById("voiceBtn");
  const voiceIcon = document.getElementById("voiceIcon");
  voiceBtn.classList.remove("recording");
  voiceIcon.innerHTML = `<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/>`;
  document.getElementById("recordingBar").classList.add("hidden");
}

function cancelRecording() {
  if (!mediaRecorder || !isRecording) return;
  clearInterval(recInterval);
  isRecording = false;
  mediaRecorder.stream.getTracks().forEach((t) => t.stop());
  mediaRecorder.ondataavailable = null;
  mediaRecorder.onstop = null;
  mediaRecorder.stop();
  document.getElementById("voiceBtn").classList.remove("recording");
  document.getElementById("voiceIcon").innerHTML = `<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/>`;
  document.getElementById("recordingBar").classList.add("hidden");
  showToast("Recording cancelled", "warning");
}

async function uploadAudio(blob) {
  showToast("Sending voice...", "");
  const fd = new FormData();
  fd.append("file", blob, "voice.webm");
  try {
    const res  = await fetch("/upload", { method: "POST", body: fd });
    const data = await res.json();
    if (!data.url) throw new Error();
    showToast("Voice sent!", "success");
    if (isFakeRoom) {
      appendMessage({ id: genId(), username: myName, mediaUrl: data.url, mediaType: "audio", time: getTime(), sentAt: Date.now() }, true);
      return;
    }
    socket.emit("send-message", { mediaUrl: data.url, mediaType: "audio" });
  } catch { showToast("Voice upload failed!", "error"); }
}

// ══════════════════════════════════════════════════════════
//  EMOJI PICKER
// ══════════════════════════════════════════════════════════
function renderEmojiGrid(cat) {
  const grid = document.getElementById("emojiGrid");
  grid.innerHTML = "";
  EMOJIS[cat].forEach((em) => {
    const btn = document.createElement("button");
    btn.className = "e-btn"; btn.textContent = em;
    btn.onclick = () => insertEmoji(em);
    grid.appendChild(btn);
  });
}
function showEmojiCat(cat, tabEl) {
  currentEmojiCat = cat;
  document.querySelectorAll(".emoji-tab").forEach((t) => t.classList.remove("active"));
  tabEl.classList.add("active");
  renderEmojiGrid(cat);
}
function toggleEmoji() {
  emojiOpen = !emojiOpen;
  document.getElementById("emojiPicker").classList.toggle("hidden", !emojiOpen);
  if (emojiOpen) renderEmojiGrid(currentEmojiCat);
}
function closeEmoji() {
  emojiOpen = false;
  document.getElementById("emojiPicker").classList.add("hidden");
}
function insertEmoji(em) {
  const input = document.getElementById("msgInput");
  const pos   = input.selectionStart;
  input.value = input.value.slice(0, pos) + em + input.value.slice(pos);
  input.selectionStart = input.selectionEnd = pos + em.length;
  input.focus();
}
document.addEventListener("click", (e) => {
  if (!e.target.closest("#emojiPicker") && !e.target.closest(".emoji-toggle")) closeEmoji();
});

// ══════════════════════════════════════════════════════════
//  RENDER MESSAGE
// ══════════════════════════════════════════════════════════
function appendMessage(msg, isMine) {
  const area    = document.getElementById("messagesArea");
  const welcome = document.getElementById("welcomeMsg");
  if (welcome) welcome.remove();

  const wrapper = document.createElement("div");
  wrapper.className   = "msg-wrapper " + (isMine ? "sent" : "received");
  wrapper.dataset.id  = msg.id || "";
  wrapper.dataset.sentAt = msg.sentAt || msg.createdAt || Date.now();

  if (!isMine) {
    const nameEl = document.createElement("div");
    nameEl.className   = "msg-name";
    nameEl.textContent = msg.username;
    wrapper.appendChild(nameEl);
  }

  // ── Edit / Delete actions (only for own messages) ──
  if (isMine && !msg.mediaType) {
    const actions = document.createElement("div");
    actions.className = "msg-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "msg-action-btn";
    editBtn.title     = "Edit";
    editBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
    editBtn.onclick = () => startEdit(wrapper, msg);

    const delBtn = document.createElement("button");
    delBtn.className = "msg-action-btn del";
    delBtn.title     = "Delete";
    delBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
    delBtn.onclick = () => deleteMessage(wrapper, msg);

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    wrapper.appendChild(actions);
  }

  // ── Bubble content ──
  const bubble = document.createElement("div");

  if (msg.mediaType === "image") {
    bubble.className = "msg-bubble media-bubble";
    const img = document.createElement("img");
    img.src = msg.mediaUrl; img.alt = "Image"; img.loading = "lazy";
    img.onclick = () => openModal("image", msg.mediaUrl);
    bubble.appendChild(img);
  } else if (msg.mediaType === "video") {
    bubble.className = "msg-bubble media-bubble";
    const vid = document.createElement("video");
    vid.src = msg.mediaUrl; vid.controls = true; vid.preload = "metadata";
    bubble.appendChild(vid);
  } else if (msg.mediaType === "audio") {
    bubble.className = "msg-bubble";
    bubble.style.cssText = "padding:0;background:transparent;border:none;";
    bubble.appendChild(createAudioPlayer(msg.mediaUrl));
  } else {
    bubble.className   = "msg-bubble";
    bubble.textContent = msg.text || "";
  }
  wrapper.appendChild(bubble);

  // ── Time row ──
  const timeEl = document.createElement("div");
  timeEl.className = "msg-time";
  timeEl.innerHTML = msg.time || "";
  if (msg.edited) {
    const editedLbl = document.createElement("span");
    editedLbl.className   = "edited-label";
    editedLbl.textContent = "edited";
    timeEl.appendChild(editedLbl);
  }
  wrapper.appendChild(timeEl);

  area.appendChild(wrapper);
  scrollToBottom();
}

// ══════════════════════════════════════════════════════════
//  CUSTOM AUDIO PLAYER
// ══════════════════════════════════════════════════════════
function createAudioPlayer(src) {
  const container = document.createElement("div");
  container.className = "custom-audio";

  const audio = new Audio(src);
  let playing = false;

  // Play/Pause button
  const playBtn = document.createElement("button");
  playBtn.className = "audio-play-btn";
  setPlayIcon(playBtn, false);

  playBtn.onclick = () => {
    if (playing) { audio.pause(); playing = false; setPlayIcon(playBtn, false); }
    else { audio.play(); playing = true; setPlayIcon(playBtn, true); }
  };

  // Progress wrap
  const wrap = document.createElement("div");
  wrap.className = "audio-progress-wrap";

  const bar = document.createElement("div");
  bar.className = "audio-bar";

  const fill = document.createElement("div");
  fill.className = "audio-fill";
  bar.appendChild(fill);

  const timeLabel = document.createElement("span");
  timeLabel.className   = "audio-time";
  timeLabel.textContent = "0:00";

  bar.onclick = (e) => {
    if (!audio.duration) return;
    const rect = bar.getBoundingClientRect();
    audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
  };

  audio.ontimeupdate = () => {
    if (!audio.duration) return;
    fill.style.width    = (audio.currentTime / audio.duration * 100) + "%";
    timeLabel.textContent = fmtAudioTime(audio.currentTime) + " / " + fmtAudioTime(audio.duration);
  };
  audio.onended = () => {
    playing = false; setPlayIcon(playBtn, false);
    fill.style.width = "0%";
    timeLabel.textContent = "0:00 / " + fmtAudioTime(audio.duration);
  };
  audio.onloadedmetadata = () => {
    timeLabel.textContent = "0:00 / " + fmtAudioTime(audio.duration);
  };

  wrap.appendChild(bar);
  wrap.appendChild(timeLabel);
  container.appendChild(playBtn);
  container.appendChild(wrap);
  return container;
}

function setPlayIcon(btn, playing) {
  btn.innerHTML = playing
    ? `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
}

function fmtAudioTime(s) {
  if (!s || isNaN(s)) return "0:00";
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// ══════════════════════════════════════════════════════════
//  EDIT MESSAGE
// ══════════════════════════════════════════════════════════
function startEdit(wrapper, msg) {
  const sentAt  = parseInt(wrapper.dataset.sentAt) || 0;
  const elapsed = Date.now() - sentAt;

  if (elapsed > ONE_HOUR) {
    showToast("Edit time limit reached (1 hour)!", "error");
    return;
  }

  const bubble = wrapper.querySelector(".msg-bubble");
  const oldText = bubble.textContent;

  // Replace bubble with textarea
  const textarea = document.createElement("textarea");
  textarea.className = "msg-edit-box";
  textarea.value     = oldText;
  textarea.rows      = Math.max(1, Math.ceil(oldText.length / 40));

  const editActions = document.createElement("div");
  editActions.className = "msg-edit-actions";

  const saveBtn = document.createElement("button");
  saveBtn.className   = "edit-save-btn";
  saveBtn.textContent = "Save";

  const cancelBtn = document.createElement("button");
  cancelBtn.className   = "edit-cancel-btn";
  cancelBtn.textContent = "Cancel";

  cancelBtn.onclick = () => {
    textarea.replaceWith(bubble);
    editActions.remove();
  };

  saveBtn.onclick = () => {
    const newText = textarea.value.trim();
    if (!newText) return;

    if (isFakeRoom) {
      bubble.textContent = newText;
      textarea.replaceWith(bubble);
      editActions.remove();
      return;
    }

    socket.emit("edit-message", { id: wrapper.dataset.id, newText }, (res) => {
      if (res.success) {
        bubble.textContent = newText;
        textarea.replaceWith(bubble);
        editActions.remove();
        // Add "edited" label if not there
        const timeEl = wrapper.querySelector(".msg-time");
        if (timeEl && !timeEl.querySelector(".edited-label")) {
          const lbl = document.createElement("span");
          lbl.className = "edited-label"; lbl.textContent = "edited";
          timeEl.appendChild(lbl);
        }
      } else {
        showToast(res.error || "Cannot edit!", "error");
        textarea.replaceWith(bubble);
        editActions.remove();
      }
    });
  };

  editActions.appendChild(cancelBtn);
  editActions.appendChild(saveBtn);
  bubble.replaceWith(textarea);
  wrapper.insertBefore(editActions, wrapper.querySelector(".msg-time"));
  textarea.focus();
}

// ══════════════════════════════════════════════════════════
//  DELETE MESSAGE
// ══════════════════════════════════════════════════════════
function deleteMessage(wrapper, msg) {
  const sentAt  = parseInt(wrapper.dataset.sentAt) || 0;
  const elapsed = Date.now() - sentAt;

  if (elapsed > ONE_HOUR) {
    showToast("Delete time limit reached (1 hour)!", "error");
    return;
  }

  if (!confirm("Delete this message?")) return;

  if (isFakeRoom) {
    wrapper.style.animation = "msgIn .2s ease reverse";
    setTimeout(() => wrapper.remove(), 200);
    return;
  }

  socket.emit("delete-message", { id: wrapper.dataset.id }, (res) => {
    if (res.success) {
      wrapper.style.animation = "msgIn .2s ease reverse";
      setTimeout(() => wrapper.remove(), 200);
    } else {
      showToast(res.error || "Cannot delete!", "error");
    }
  });
}

// ══════════════════════════════════════════════════════════
//  MEDIA MODAL
// ══════════════════════════════════════════════════════════
function openModal(type, src) {
  const modal = document.getElementById("mediaModal");
  const img   = document.getElementById("modalImg");
  const vid   = document.getElementById("modalVid");
  if (type === "image") { img.src = src; img.style.display = "block"; vid.style.display = "none"; }
  else { vid.src = src; vid.style.display = "block"; img.style.display = "none"; }
  modal.classList.remove("hidden");
}
function closeModal() {
  document.getElementById("mediaModal").classList.add("hidden");
  document.getElementById("modalVid").pause();
}

// ══════════════════════════════════════════════════════════
//  SOCKET EVENTS
// ══════════════════════════════════════════════════════════
socket.on("load-messages", (msgs) => { pendingMessages = msgs; });

socket.on("new-message", (msg) => {
  if (isFakeRoom) return;
  appendMessage(msg, msg.username === myName);
});

// Someone edited a message
socket.on("message-edited", ({ id, newText }) => {
  if (isFakeRoom) return;
  const wrapper = document.querySelector(`[data-id="${id}"]`);
  if (!wrapper) return;
  const bubble = wrapper.querySelector(".msg-bubble");
  if (bubble) bubble.textContent = newText;
  const timeEl = wrapper.querySelector(".msg-time");
  if (timeEl && !timeEl.querySelector(".edited-label")) {
    const lbl = document.createElement("span");
    lbl.className = "edited-label"; lbl.textContent = "edited";
    timeEl.appendChild(lbl);
  }
});

// Someone deleted a message
socket.on("message-deleted", ({ id }) => {
  if (isFakeRoom) return;
  const wrapper = document.querySelector(`[data-id="${id}"]`);
  if (wrapper) wrapper.remove();
});

// Clear all chats — silent (no message in chat)
socket.on("clear-chat", () => {
  if (isFakeRoom) return;
  document.getElementById("messagesArea").innerHTML =
    `<div class="welcome-msg" id="welcomeMsg"><span>🔒</span> Welcome to the real chat room!</div>`;
});

socket.on("kicked", (reason) => {
  alert("You have been removed: " + reason);
  location.reload();
});

socket.on("online-count", (count) => {
  document.getElementById("onlineCount").textContent = count + " online";
});

// ══════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════
function scrollToBottom() {
  const a = document.getElementById("messagesArea");
  a.scrollTop = a.scrollHeight;
}
function getTime() {
  return new Date().toLocaleTimeString("en-US", { hour:"2-digit", minute:"2-digit", hour12:true });
}
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

let toastTimer = null;
function showToast(msg, type = "success") {
  const t = document.getElementById("toast");
  t.textContent = msg; t.className = "toast show " + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3000);
}
function showError(elId, msg) {
  const el = document.getElementById(elId);
  el.textContent = msg;
  el.style.animation = "none"; void el.offsetWidth;
  el.style.animation = "shake .3s ease";
}
