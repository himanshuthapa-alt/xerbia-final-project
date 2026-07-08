const Notification = require('./notification.model');

/**
 * Fire-and-forget in-app notification. Never let a notification failure
 * break the business operation that triggered it.
 */
async function notify(userId, type, message) {
  try {
    if (!userId) return;
    await Notification.create({ user: userId, type, message });
  } catch (err) {
    console.warn('[notify] failed:', err.message);
  }
}

module.exports = { notify };
