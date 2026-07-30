const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');

function createNotificationService(firebaseServiceAccountJson) {
  const tokens = new Set();

  function initializeFirebaseAdmin() {
    if (getApps().length) return true;
    if (!firebaseServiceAccountJson) {
      console.warn('FCM disabled: FIREBASE_SERVICE_ACCOUNT_JSON is missing.');
      return false;
    }

    try {
      initializeApp({
        credential: cert(JSON.parse(firebaseServiceAccountJson)),
      });
      return true;
    } catch (error) {
      console.error('FCM disabled: invalid FIREBASE_SERVICE_ACCOUNT_JSON.', error.message);
      return false;
    }
  }

  const enabled = initializeFirebaseAdmin();

  function isValidToken(value) {
    return typeof value === 'string' && value.trim().length > 20;
  }

  function registerToken(value) {
    const token = typeof value === 'string' ? value.trim() : '';
    if (!isValidToken(token)) return false;
    tokens.add(token);
    return true;
  }

  async function sendToAll(payload) {
    const registeredTokens = [...tokens];
    const results = {
      success: 0,
      failed: 0,
      removed: 0,
      total: registeredTokens.length,
    };

    for (const token of registeredTokens) {
      try {
        await getMessaging().send({
          token,
          notification: {
            title: payload.title,
            body: payload.body,
          },
          webpush: {
            notification: {
              title: payload.title,
              body: payload.body,
              icon: '/icons/icon-192.png',
            },
            fcmOptions: {
              link: payload.url,
            },
            data: {
              title: payload.title,
              body: payload.body,
              url: payload.url,
            },
          },
        });
        results.success += 1;
      } catch (error) {
        results.failed += 1;
        const code = String(error?.code || '');
        if (
          code === 'messaging/registration-token-not-registered'
          || code === 'messaging/invalid-registration-token'
        ) {
          tokens.delete(token);
          results.removed += 1;
        }
      }
    }

    return results;
  }

  return {
    enabled,
    get tokenCount() {
      return tokens.size;
    },
    registerToken,
    sendToAll,
  };
}

module.exports = { createNotificationService };
