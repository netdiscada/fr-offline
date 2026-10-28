// FR Offline - service worker (PWA). Guarda o app inteiro no celular.
// Tudo offline: nada depende de servidor externo.
const VERSAO = '1.0.0';
const CACHE = 'fr-offline-' + VERSAO;

const ARQUIVOS = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './js/db.js',
  './js/app.js',
  './js/pdf.js',
  './js/csp.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ARQUIVOS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(chaves => Promise.all(chaves.filter(k => k.startsWith('fr-offline-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Apenas arquivos do próprio domínio entram no cache
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req).then(r => r || fetch(req))
  );
});
