const CACHE_NAME = 'shreevidhya-v4';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Do not cache API calls or Supabase storage requests
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/rest/v1/') || url.pathname.startsWith('/storage/v1/')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => cachedResponse || fetch(event.request))
      .catch(() => new Response('Offline'))
  );
});
