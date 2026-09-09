// Network-only: no authentication response or Stock data is cached.
// Scope is /gestion-stock/passkeys/ only. Version 20260909-1.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => { if (event.request.method === 'GET' && event.request.url.startsWith(self.registration.scope)) event.respondWith(fetch(event.request)); });
