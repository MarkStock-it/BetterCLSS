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
  updateNotificationUi();
  if (!('serviceWorker' in navigator) || !('Notification' in window)) {
    updateNotificationUi('unsupported');
    return;
  }

  try {
    const swRegistration = await navigator.serviceWorker.register('./service-worker.js?v=6');
    await swRegistration.update().catch(() => {});
    console.log('Service worker registered:', swRegistration.scope);
    updateNotificationUi();
  } catch (error) {
    console.error('Push setup failed:', error);
    updateNotificationUi('error');
  }
}

function pushIsConfigured() {
  return !Object.values(firebaseConfig).some((value) => String(value).startsWith('YOUR_'))
    && firebasePublicVapidKey !== 'YOUR_PUBLIC_VAPID_KEY';
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') resolve();
      else existing.addEventListener('load', resolve, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    }, { once: true });
    script.addEventListener('error', () => reject(new Error('Could not load notification support')), { once: true });
    document.head.appendChild(script);
  });
}

async function loadFirebaseScripts() {
  if (typeof firebase !== 'undefined') return;
  await loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
  await loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
}

function updateNotificationUi(forcedState) {
  const text = document.getElementById('notificationStatusText');
  const button = document.getElementById('notificationEnableBtn');
  if (!text || !button) return;

  if (forcedState === 'unsupported' || !('serviceWorker' in navigator) || !('Notification' in window)) {
    text.textContent = 'Not supported by this browser';
    button.disabled = true;
    return;
  }
  if (forcedState === 'error') {
    text.textContent = 'Setup failed—try again';
    return;
  }
  if (Notification.permission === 'denied') {
    text.textContent = 'Blocked in browser settings';
    button.disabled = true;
    return;
  }
  if (!pushIsConfigured()) {
    text.textContent = 'Not configured by the site owner';
    button.disabled = true;
    return;
  }
  if (Notification.permission === 'granted') {
    text.textContent = 'Enabled on this device';
    button.textContent = 'Notifications enabled';
    button.disabled = true;
    return;
  }
  text.textContent = 'Not enabled';
}

async function enableAppNotifications() {
  if (!pushIsConfigured()) {
    updateNotificationUi();
    return;
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      updateNotificationUi();
      return;
    }

    const swRegistration = await navigator.serviceWorker.ready;
    await loadFirebaseScripts();
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    const messaging = firebase.messaging();
    const token = await messaging.getToken({
      vapidKey: firebasePublicVapidKey,
      serviceWorkerRegistration: swRegistration
    });
    if (!token) throw new Error('No notification token returned');

    const response = await fetch(CanvasAPI.apiUrl('/register-token'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    if (!response.ok) throw new Error(`Registration failed: HTTP ${response.status}`);

    messaging.onMessage((payload) => {
      const title = payload?.notification?.title || payload?.data?.title || 'BetterCLSS';
      const options = {
        body: payload?.notification?.body || payload?.data?.body || 'You have a new update.',
        icon: 'icons/icon-192.svg',
        badge: 'icons/icon-192.svg',
        data: { url: payload?.data?.url || './index.html' }
      };
      new Notification(title, options);
    });
    updateNotificationUi();
  } catch (error) {
    console.error('Push enable failed:', error);
    updateNotificationUi('error');
  }
}
