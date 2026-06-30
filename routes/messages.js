const express = require("express");
const Message = require("../models/Message");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

function getChatId(uid1, uid2) {
  return [uid1, uid2].sort().join("_");
}

// GET chat history between logged-in user and another user
router.get("/:otherUserId", authMiddleware, async (req, res) => {
  try {
    const chatId = getChatId(req.user.id, req.params.otherUserId);
    const messages = await Message.find({ chatId }).sort({ createdAt: 1 });
    res.json(messages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
