'use strict';
importScripts('./pwa-assets.js');
const CACHE_PREFIX = `mahjong-pwa:${new URL(self.registration.scope).pathname}:`;
const CACHE_NAME = CACHE_PREFIX + self.MAHJONG_PRECACHE.version;
const shellURLs = new Set(self.MAHJONG_PRECACHE.urls.map(path => new URL(path, self.registration.scope).href));

self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type === 'MAHJONG_SKIP_WAITING') self.skipWaiting();
  if (data.type === 'MAHJONG_VERSION') event.source?.postMessage({ type: 'MAHJONG_VERSION', version: self.MAHJONG_PRECACHE.version, label: self.MAHJONG_PRECACHE.label });
});

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(
    [...shellURLs].map(url => new Request(url, { cache: 'reload' }))
  )));
  // Updates wait until existing game tabs close; never reload an active hand.
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (request.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)
      || request.headers.has('range')) return;
  const entry = url.pathname === scope.pathname || url.pathname === scope.pathname + 'index.html';
  const canonical = new URL(url.pathname, url.origin).href;
  const shell = shellURLs.has(canonical);
  const asset = url.pathname.startsWith(scope.pathname + 'assets/');
  if (!entry && !shell && !asset) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const key = entry ? new URL('index.html', scope).href : shell ? canonical : request;
    const cached = await cache.match(key);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.status === 200 && response.type === 'basic') {
      // Storage limits must not turn a successful network response into an error.
      event.waitUntil(cache.put(key, response.clone()).catch(() => {}));
    }
    return response;
  })());
});
