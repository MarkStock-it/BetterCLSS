/* global importScripts, firebase */

const CACHE_NAME = 'betterclss-v7';
const OFFLINE_URLS = [
  './',
  './index.html',
  './StudentHub.html',
  './styles.css?v=6',
  './canvas-api.js?v=6',
  './user-auth.js?v=6',
  './config.js?v=6',
  './push-notifications.js?v=6',
  './manifest.json',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

function isHtmlRequest(request) {
  const accept = request.headers.get('accept') || '';
  return request.mode === 'navigate' || accept.includes('text/html');
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);

  // Authentication and Canvas responses must always come from the network.
  // Never place user-specific API data in the shared app-shell cache.
  if (
    requestUrl.pathname.includes('/api/')
    || requestUrl.pathname.endsWith('/register-token')
    || requestUrl.pathname.endsWith('/send-notification')
  ) {
    return;
  }

  // Always prefer fresh HTML so UI/script updates are not stuck behind old cached pages.
  if (isHtmlRequest(event.request)) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          const cloned = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned)).catch(() => {});
          return networkResponse;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // Prefer fresh same-origin CSS/JS/assets. This prevents a newly deployed HTML
  // file from being paired with an older cached stylesheet or script.
  if (requestUrl.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse.ok) {
            const cloned = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned)).catch(() => {});
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request).then((cached) => (
          cached || new Response('', { status: 504, statusText: 'Offline' })
        )))
    );
    return;
  }

  // Cache-first is reserved for immutable third-party resources such as fonts.
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(event.request).then((networkResponse) => {
          const cloned = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned)).catch(() => {});
          return networkResponse;
        });
      })
      .catch(() => new Response('', { status: 504, statusText: 'Offline' }))
  );
});

const firebaseConfig = {
  apiKey: 'YOUR_FIREBASE_API_KEY',
  authDomain: 'YOUR_FIREBASE_AUTH_DOMAIN',
  projectId: 'YOUR_FIREBASE_PROJECT_ID',
  storageBucket: 'YOUR_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'YOUR_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'YOUR_FIREBASE_APP_ID'
};

if (!Object.values(firebaseConfig).some((value) => String(value).startsWith('YOUR_'))) {
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
  firebase.initializeApp(firebaseConfig);
  firebase.messaging().onBackgroundMessage((payload) => {
    const title = payload?.notification?.title || payload?.data?.title || 'BetterCLSS';
    const options = {
      body: payload?.notification?.body || payload?.data?.body || 'You have a new update.',
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      data: { url: payload?.data?.url || './index.html' }
    };
    self.registration.showNotification(title, options);
  });
}

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = {};
  }

  const title = payload?.notification?.title || payload?.data?.title || 'BetterCLSS';
  const options = {
    body: payload?.notification?.body || payload?.data?.body || 'You have a new update.',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    data: {
      url: payload?.data?.url || './index.html'
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || './index.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
      return null;
    })
  );
});
