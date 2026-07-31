const express = require('express');
const router = express.Router();
const chatAssistant = require('../services/ai/chatAssistant');

router.post('/chat', async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'message is required' });
    }
    const reply = await chatAssistant.answer(message, history || []);
    res.json({ reply });
  } catch (err) {
    console.error('[assistant] chat error:', err.message);
    res.status(500).json({ error: err.message || 'AI assistant failed' });
  }
});

module.exports = router;
