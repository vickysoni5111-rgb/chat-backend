require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const mongoose = require("mongoose");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const messageRoutes = require("./routes/messages");
const Message = require("./models/Message");

const app = express();
const server = http.createServer(app);

const allowedOrigin = process.env.CLIENT_URL || "http://localhost:5173";

app.use(cors({ origin: allowedOrigin }));
app.use(express.json());

// REST routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/messages", messageRoutes);

app.get("/", (req, res) => {
  res.send("Chat backend chal raha hai");
});

// Socket.io setup
const io = new Server(server, {
  cors: { origin: allowedOrigin, methods: ["GET", "POST"] },
});

function getChatId(uid1, uid2) {
  return [uid1, uid2].sort().join("_");
}

// Socket auth middleware - verify JWT before allowing connection
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("Token nahi mila"));

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded; // { id, name, email }
    next();
  } catch (err) {
    next(new Error("Token invalid hai"));
  }
});

// Track online users: userId -> socketId
const onlineUsers = new Map();

io.on("connection", (socket) => {
  const userId = socket.user.id;
  onlineUsers.set(userId, socket.id);
  io.emit("online-users", Array.from(onlineUsers.keys()));

  console.log(`${socket.user.name} connected`);

  // Join a chat room with another user
  socket.on("join-chat", ({ otherUserId }) => {
    const chatId = getChatId(userId, otherUserId);
    socket.join(chatId);
  });

  // Handle sending a message
  socket.on("send-message", async ({ otherUserId, text }) => {
    if (!text?.trim()) return;

    const chatId = getChatId(userId, otherUserId);

    try {
      const message = await Message.create({
        chatId,
        senderId: userId,
        senderName: socket.user.name,
        text: text.trim(),
      });

      io.to(chatId).emit("receive-message", {
        _id: message._id,
        chatId,
        senderId: userId,
        senderName: socket.user.name,
        text: message.text,
        createdAt: message.createdAt,
      });
    } catch (err) {
      console.error("Message save error:", err);
      socket.emit("message-error", { message: "Message bhejne me error aaya" });
    }
  });

  // Typing indicator
  socket.on("typing", ({ otherUserId, isTyping }) => {
    const chatId = getChatId(userId, otherUserId);
    socket.to(chatId).emit("user-typing", {
      userId,
      isTyping,
    });
  });

  socket.on("disconnect", () => {
    onlineUsers.delete(userId);
    io.emit("online-users", Array.from(onlineUsers.keys()));
    console.log(`${socket.user.name} disconnected`);
  });
});

// Connect to MongoDB and start server
const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
    server.listen(PORT, () => console.log(`Server chal raha hai port ${PORT} pe`));
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
  });
