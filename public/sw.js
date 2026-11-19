// Unicorn service worker. Its only job is to make the app installable.
// It deliberately does not cache anything: Unicorn pages and data are
// authenticated and change often, so every request goes to the network.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
