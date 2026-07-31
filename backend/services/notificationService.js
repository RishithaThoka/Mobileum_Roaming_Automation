const { v4: uuid } = require('uuid');
const db = require('../db');

function createNotification({ operatorId, type, message, recipient = 'admin' }) {
  const id = uuid();
  db.prepare(`
    INSERT INTO notifications (id, operator_id, type, message, recipient, read)
    VALUES (?, ?, ?, ?, ?, 0)
  `).run(id, operatorId || null, type, message, recipient);

  const notification = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);
  return notification;
}

function getNotifications({ limit = 50, unreadOnly = false, operatorId = null } = {}) {
  let query = 'SELECT n.*, o.name as operator_name FROM notifications n LEFT JOIN operators o ON n.operator_id = o.id';
  const params = [];
  const conditions = [];

  if (unreadOnly) {
    conditions.push('n.read = 0');
  }
  if (operatorId) {
    conditions.push('n.operator_id = ?');
    params.push(operatorId);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY n.created_at DESC LIMIT ?';
  params.push(limit);

  const items = db.prepare(query).all(...params);
  const unreadCount = db.prepare('SELECT COUNT(*) c FROM notifications WHERE read = 0').get().c;

  return { items, unreadCount };
}

function markAllAsRead() {
  db.prepare('UPDATE notifications SET read = 1 WHERE read = 0').run();
  return { success: true };
}

function markAsRead(id) {
  db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(id);
  return { success: true };
}

module.exports = {
  createNotification,
  getNotifications,
  markAllAsRead,
  markAsRead
};
