const express = require('express');
const notificationService = require('../services/notificationService');
const router = express.Router();

router.get('/', (req, res) => {
  const unreadOnly = req.query.unreadOnly === 'true';
  const limit = Number(req.query.limit || 50);
  const operatorId = req.query.operatorId || null;

  const result = notificationService.getNotifications({ limit, unreadOnly, operatorId });
  res.json(result);
});

router.post('/read-all', (req, res) => {
  const result = notificationService.markAllAsRead();
  res.json(result);
});

router.post('/:id/read', (req, res) => {
  const result = notificationService.markAsRead(req.params.id);
  res.json(result);
});

module.exports = router;
