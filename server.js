import express from "express";
import http from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import dotenv from "dotenv";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const app        = express();
const server     = http.createServer(app);
const io         = new Server(server);

app.use(express.static("public"));
app.use(express.json());

// ══════════════════════════════════════════════════════════
//  UPLOADS
// ══════════════════════════════════════════════════════════
const uploadsDir = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename:    (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpg|jpeg|png|gif|webp|mp4|webm|mov|ogg|wav|mp3/i;
    const ext = path.extname(file.originalname).slice(1);
    allowed.test(ext) ? cb(null, true) : cb(new Error("File type not allowed"));
  },
});

app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "File nahi mila" });
  const mime = req.file.mimetype;
  const type = mime.startsWith("image/") ? "image"
             : mime.startsWith("video/") ? "video" : "audio";
  res.json({ url: `/uploads/${req.file.filename}`, type });
});

// ══════════════════════════════════════════════════════════
//  MONGOOSE SCHEMAS
// ══════════════════════════════════════════════════════════
const messageSchema = new mongoose.Schema({
  id:        { type: String, required: true, unique: true },
  username:  { type: String, required: true },
  text:      { type: String, default: null },
  mediaUrl:  { type: String, default: null },
  mediaType: { type: String, enum: ["image","video","audio",null], default: null },
  edited:    { type: Boolean, default: false },
  time:      { type: String, required: true },
  createdAt: { type: Date,   default: Date.now },
});
const Message = mongoose.model("Message", messageSchema);

const reservedSchema = new mongoose.Schema({
  name:    { type: String, required: true, unique: true, lowercase: true },
  note:    { type: String, default: "" },
  addedAt: { type: Date,   default: Date.now },
});
const Reserved = mongoose.model("Reserved", reservedSchema);

// ══════════════════════════════════════════════════════════
//  IN-MEMORY STORE
// ══════════════════════════════════════════════════════════
// activeUsers: lowerName → { socketId, username, joinedAt, lastActive, msgCount, ip }
const activeUsers = new Map();
let cachedMessages  = [];
let reservedNames   = new Set(); // fast lookup
const serverStart   = new Date();

// ══════════════════════════════════════════════════════════
//  MONGODB CONNECT
// ══════════════════════════════════════════════════════════
mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("✅ MongoDB connected!");
    try {
      cachedMessages = await Message.find().sort({ createdAt: 1 }).limit(100).lean();
      console.log(`📦 ${cachedMessages.length} messages loaded`);
      const reserved = await Reserved.find().lean();
      reserved.forEach((r) => reservedNames.add(r.name));
      console.log(`🚫 ${reservedNames.size} reserved names loaded`);
    } catch (e) { console.error("Load error:", e.message); }
  })
  .catch((e) => console.error("❌ MongoDB:", e.message));

// ══════════════════════════════════════════════════════════
//  SECRET CODES (changeable from admin)
// ══════════════════════════════════════════════════════════
let secretCodes = {
  realChat:  "1234",
  deleteAll: "786",
  ghostRoom: "7070",
};

// ══════════════════════════════════════════════════════════
//  ADMIN AUTH MIDDLEWARE
// ══════════════════════════════════════════════════════════
function adminAuth(req, res, next) {
  const token = req.headers["x-admin-token"];
  if (!token || token !== process.env.ADMIN_PASS)
    return res.status(401).json({ error: "Unauthorized" });
  next();
}

// ══════════════════════════════════════════════════════════
//  ADMIN API ROUTES
// ══════════════════════════════════════════════════════════

// Get secret codes
app.get("/api/admin/codes", adminAuth, (req, res) => {
  res.json(secretCodes);
});

// Update secret codes
app.put("/api/admin/codes", adminAuth, (req, res) => {
  const { realChat, deleteAll, ghostRoom } = req.body;
  if (!realChat || !deleteAll || !ghostRoom)
    return res.status(400).json({ error: "All 3 codes required" });
  if (realChat === deleteAll || deleteAll === ghostRoom || realChat === ghostRoom)
    return res.status(400).json({ error: "All codes must be different!" });
  secretCodes.realChat  = realChat.trim();
  secretCodes.deleteAll = deleteAll.trim();
  secretCodes.ghostRoom = ghostRoom.trim();
  console.log("🔑 Codes updated:", secretCodes);
  res.json({ success: true, codes: secretCodes });
});

// Stats overview
app.get("/api/admin/stats", adminAuth, (req, res) => {
  const uptimeSec = Math.floor((Date.now() - serverStart.getTime()) / 1000);
  const h = Math.floor(uptimeSec / 3600);
  const m = Math.floor((uptimeSec % 3600) / 60);
  const s = uptimeSec % 60;
  res.json({
    activeUsers:   activeUsers.size,
    totalMessages: cachedMessages.length,
    reservedCount: reservedNames.size,
    uptime:        `${h}h ${m}m ${s}s`,
    serverStart:   serverStart,
  });
});

// Active users list
app.get("/api/admin/users", adminAuth, (req, res) => {
  const users = [];
  activeUsers.forEach((data) => {
    users.push({
      username:     data.username,
      joinedAt:     data.joinedAt,
      lastActive:   data.lastActive,
      messageCount: data.msgCount,
      ip:           data.ip,
    });
  });
  users.sort((a, b) => new Date(b.joinedAt) - new Date(a.joinedAt));
  res.json(users);
});

// Reserved names — list
app.get("/api/admin/reserved", adminAuth, async (req, res) => {
  try {
    const names = await Reserved.find().sort({ addedAt: -1 }).lean();
    res.json(names);
  } catch { res.json([]); }
});

// Reserved names — add
app.post("/api/admin/reserved", adminAuth, async (req, res) => {
  const { name, note } = req.body;
  if (!name) return res.status(400).json({ error: "Name required" });
  const lower = name.trim().toLowerCase();
  try {
    await Reserved.create({ name: lower, note: note || "" });
    reservedNames.add(lower);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: "Already reserved ya error" });
  }
});

// Reserved names — update note
app.put("/api/admin/reserved/:name", adminAuth, async (req, res) => {
  const lower = req.params.name.toLowerCase();
  const { note } = req.body;
  try {
    await Reserved.updateOne({ name: lower }, { note: note || "" });
    res.json({ success: true });
  } catch { res.status(500).json({ error: "Error" }); }
});

// Reserved names — delete
app.delete("/api/admin/reserved/:name", adminAuth, async (req, res) => {
  const lower = req.params.name.toLowerCase();
  try {
    await Reserved.deleteOne({ name: lower });
    reservedNames.delete(lower);
    res.json({ success: true });
  } catch { res.status(500).json({ error: "Error" }); }
});

// Recent messages
app.get("/api/admin/messages", adminAuth, (req, res) => {
  res.json([...cachedMessages].reverse().slice(0, 100));
});

// Clear all messages
app.delete("/api/admin/messages", adminAuth, async (req, res) => {
  cachedMessages = [];
  io.emit("clear-chat");
  Message.deleteMany({}).catch(() => {});
  res.json({ success: true });
});

// Admin — delete single message
app.delete("/api/admin/message/:id", adminAuth, (req, res) => {
  const id  = req.params.id;
  const idx = cachedMessages.findIndex((m) => m.id === id);
  if (idx === -1) return res.status(404).json({ error: "Message not found" });
  cachedMessages.splice(idx, 1);
  Message.deleteOne({ id }).catch(() => {});
  io.emit("message-deleted", { id });
  res.json({ success: true });
});

// Admin — edit single message
app.put("/api/admin/message/:id", adminAuth, (req, res) => {
  const id      = req.params.id;
  const newText = (req.body.text || "").trim();
  if (!newText) return res.status(400).json({ error: "Text required" });
  const msg = cachedMessages.find((m) => m.id === id);
  if (!msg) return res.status(404).json({ error: "Message not found" });
  msg.text   = newText;
  msg.edited = true;
  Message.updateOne({ id }, { text: newText, edited: true }).catch(() => {});
  io.emit("message-edited", { id, newText });
  res.json({ success: true });
});

// Kick user
app.post("/api/admin/kick/:name", adminAuth, (req, res) => {
  const lower  = req.params.name.toLowerCase();
  const reason = req.body.reason || "Admin ne aapko room se hata diya!";
  const user   = activeUsers.get(lower);
  if (!user) return res.status(404).json({ error: "User not found" });
  const sock = io.sockets.sockets.get(user.socketId);
  if (sock) {
    sock.emit("kicked", reason);
    setTimeout(() => sock.disconnect(true), 500);
  }
  res.json({ success: true });
});

// ══════════════════════════════════════════════════════════
//  SOCKET.IO
// ══════════════════════════════════════════════════════════
io.on("connection", (socket) => {
  const ip = socket.handshake.address;

  // ── Verify Secret Code ───────────────────────────────
  socket.on("verify-code", (code, callback) => {
    if (code === secretCodes.realChat)  return callback({ action: "real" });
    if (code === secretCodes.deleteAll) return callback({ action: "delete" });
    if (code === secretCodes.ghostRoom) return callback({ action: "ghost" });
    callback({ action: "invalid" });
  });

  socket.on("set-name", (name, callback) => {
    const trimmed   = name.trim();
    const lowerName = trimmed.toLowerCase();

    if (!trimmed || trimmed.length < 2)
      return callback({ success: false, error: "Naam kam az kam 2 characters ka hona chahiye!" });

    if (activeUsers.has(lowerName))
      return callback({ success: false, error: `"${trimmed}" naam pehle se use ho raha hai!` });

    if (reservedNames.has(lowerName))
      return callback({ success: false, error: `"${trimmed}" naam reserved hai — use nahi kar sakte!` });

    activeUsers.set(lowerName, {
      socketId:   socket.id,
      username:   trimmed,
      joinedAt:   new Date(),
      lastActive: new Date(),
      msgCount:   0,
      ip,
    });
    socket.username  = trimmed;
    socket.lowerName = lowerName;

    socket.emit("load-messages", cachedMessages);
    io.emit("online-count", activeUsers.size);
    callback({ success: true });
  });

  socket.on("send-message", (data) => {
    if (!socket.username) return;

    // Update activity
    const userData = activeUsers.get(socket.lowerName);
    if (userData) { userData.lastActive = new Date(); userData.msgCount++; }

    const msgData = {
      id:        `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      username:  socket.username,
      text:      data.text      || null,
      mediaUrl:  data.mediaUrl  || null,
      mediaType: data.mediaType || null,
      time: new Date().toLocaleTimeString("en-US", { hour:"2-digit", minute:"2-digit", hour12:true }),
    };

    io.emit("new-message", msgData);
    cachedMessages.push(msgData);
    if (cachedMessages.length > 100) cachedMessages.shift();
    Message.create(msgData).catch(() => {});
  });

  // ── Edit Message ──────────────────────────────────────
  socket.on("edit-message", ({ id, newText }, callback) => {
    if (!socket.username) return;
    const msg = cachedMessages.find((m) => m.id === id);
    if (!msg) return callback({ success: false, error: "Message not found" });
    if (msg.username !== socket.username) return callback({ success: false, error: "Not your message" });
    if (Date.now() - new Date(msg.createdAt).getTime() > 3600000)
      return callback({ success: false, error: "Edit time limit exceeded (1 hour)" });

    msg.text = newText.trim();
    msg.edited = true;
    Message.updateOne({ id }, { text: msg.text, edited: true }).catch(() => {});
    io.emit("message-edited", { id, newText: msg.text });
    callback({ success: true });
  });

  // ── Delete Message ────────────────────────────────────
  socket.on("delete-message", ({ id }, callback) => {
    if (!socket.username) return;
    const idx = cachedMessages.findIndex((m) => m.id === id);
    if (idx === -1) return callback({ success: false, error: "Message not found" });
    const msg = cachedMessages[idx];
    if (msg.username !== socket.username) return callback({ success: false, error: "Not your message" });
    if (Date.now() - new Date(msg.createdAt).getTime() > 3600000)
      return callback({ success: false, error: "Delete time limit exceeded (1 hour)" });

    cachedMessages.splice(idx, 1);
    Message.deleteOne({ id }).catch(() => {});
    io.emit("message-deleted", { id });
    callback({ success: true });
  });

  socket.on("delete-all", (callback) => {
    cachedMessages = [];
    Message.deleteMany({}).catch(() => {});
    io.emit("clear-chat");
    if (callback) callback({ success: true });
  });

  socket.on("disconnect", () => {
    if (socket.lowerName) {
      activeUsers.delete(socket.lowerName);
      io.emit("online-count", activeUsers.size);
    }
  });
});

// ══════════════════════════════════════════════════════════
//  START
// ══════════════════════════════════════════════════════════
const PORT = process.env.PORT || 5500;
server.listen(PORT, () => {
  console.log(`🚀 Chat: http://localhost:${PORT}`);
  console.log(`🔧 Admin: http://localhost:${PORT}/admin/`);
  console.log(`🔑 Admin Pass: ${process.env.ADMIN_PASS}`);
});
