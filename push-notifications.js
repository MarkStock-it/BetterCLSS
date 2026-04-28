/* global CanvasAPI, firebase */

const firebaseConfig = {
  apiKey: 'YOUR_FIREBASE_API_KEY',
  authDomain: 'YOUR_FIREBASE_AUTH_DOMAIN',
  projectId: 'YOUR_FIREBASE_PROJECT_ID',
  storageBucket: 'YOUR_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'YOUR_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'YOUR_FIREBASE_APP_ID'
};

const firebasePublicVapidKey = 'YOUR_PUBLIC_VAPID_KEY';

async function setupPushNotifications() {
  if (!('serviceWorker' in navigator) || !('Notification' in window)) {
    console.log('Push notifications are not supported in this browser.');
    return;
  }

  try {
    const swRegistration = await navigator.serviceWorker.register('./service-worker.js?v=2');
    await swRegistration.update().catch(() => {});
    console.log('Service worker registered:', swRegistration.scope);

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('Notification permission not granted.');
      return;
    }

    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }

    const messaging = firebase.messaging();
    const token = await messaging.getToken({
      vapidKey: firebasePublicVapidKey,
      serviceWorkerRegistration: swRegistration
    });

    if (!token) {
      console.log('No FCM token returned.');
      return;
    }

    await fetch(CanvasAPI.apiUrl('/register-token'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });

    messaging.onMessage((payload) => {
      const title = payload?.notification?.title || payload?.data?.title || 'BetterCLSS';
      const options = {
        body: payload?.notification?.body || payload?.data?.body || 'You have a new update.',
        icon: 'icons/icon-192.svg',
        badge: 'icons/icon-192.svg',
        data: { url: payload?.data?.url || './index.html' }
      };

      if (Notification.permission === 'granted') {
        new Notification(title, options);
      }
    });
  } catch (error) {
    console.error('Push setup failed:', error);
  }
}
