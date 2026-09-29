/* 100 - SHOPS service worker: caches the app screens so they open fast and work on weak signal.
   API calls to Google Apps Script are never cached (always live data).
   After you change any file, bump VERSION so phones pick up the update. */
const VERSION = '100shops-v3';
const SHELL = [
  './', 'index.html', 'customer.html', 'merchant.html', 'rider.html', 'admin.html',
  'app.css', 'app.js', 'config.js',
  'manifest-customer.json', 'manifest-merchant.json', 'manifest-rider.json', 'manifest-admin.json',
  'img/logo-96.png', 'img/logo-256.png', 'img/logo-512.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-merchant-192.png', 'icons/icon-rider-192.png', 'icons/icon-admin-192.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                        // API calls are POST: never cached
  const url = new URL(req.url);
  if (url.hostname.endsWith('script.google.com') || url.hostname.endsWith('googleusercontent.com')) return;
  if (url.origin === location.origin) {
    // Network first for our own files (so updates show quickly), cache when offline
    e.respondWith(fetch(req).then(res => {
      const copy = res.clone();
      if (res.ok) caches.open(VERSION).then(c => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('customer.html'))));
  } else if (url.hostname.includes('fonts.g') || url.hostname.includes('cdnjs')) {
    // Fonts and QR library: cache first
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => {
      const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res;
    })));
  }
});
