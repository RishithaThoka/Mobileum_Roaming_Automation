const { v4: uuid } = require('uuid');
const db = require('../db');

async function createNotification({ operatorId, type, message, recipient = 'admin' }) {
  const id = uuid();
  await db('notifications').insert({
    id,
    operator_id: operatorId || null,
    type,
    message,
    recipient,
    read: 0,
  });
  return db('notifications').where({ id }).first();
}

async function getNotifications({ limit = 50, unreadOnly = false, operatorId = null } = {}) {
  let query = db('notifications as n')
    .select(['n.*', 'o.name as operator_name'])
    .leftJoin('operators as o', 'n.operator_id', 'o.id')
    .orderBy('n.created_at', 'desc')
    .limit(limit);

  if (unreadOnly)  query = query.where('n.read', 0);
  if (operatorId)  query = query.where('n.operator_id', operatorId);

  const items = await query;
  const { c } = await db('notifications').where({ read: 0 }).count('* as c').first();
  return { items, unreadCount: Number(c) };
}

async function markAllAsRead() {
  await db('notifications').where({ read: 0 }).update({ read: 1 });
  return { success: true };
}

async function markAsRead(id) {
  await db('notifications').where({ id }).update({ read: 1 });
  return { success: true };
}

module.exports = { createNotification, getNotifications, markAllAsRead, markAsRead };
