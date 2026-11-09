# Secret Chat Room 🔐

A real-time private chat application with secret access codes.

## Features
- 🔐 Secret code entry system
- 💬 Real-time messaging (Socket.io)
- 📸 Photo & video sharing
- 🎤 Voice messages
- 👻 Ghost/fake room mode
- 🔧 Admin dashboard

## Setup

```bash
npm install
```

Create a `.env` file:
```
MONGO_URI=your_mongodb_uri
PORT=5500
ADMIN_PASS=your_admin_password
```

```bash
npm start
```

- Chat: `http://localhost:5500`
- Admin: `http://localhost:5500/admin/`
