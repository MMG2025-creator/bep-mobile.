// One-time cache cleanup: retire the previous offline cache and service worker.
self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", event => event.waitUntil((async () => {
  const names = await caches.keys();
  await Promise.all(names.map(name => caches.delete(name)));
  await self.registration.unregister();
  const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clientsList) client.navigate(client.url);
})()));
