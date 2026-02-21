// Service worker for Echo Chore Calendar
// Strategy: cache hashed Vite assets (JS/CSS/fonts/images) aggressively.
// HTML files are intentionally NOT cached — the app uses no-store headers
// on index.html and we want fresh content on every visit.

const CACHE_NAME = 'chore-calendar-v1';

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    // Clear any old cache versions
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Skip non-GET requests and anything outside our scope
    if (event.request.method !== 'GET') return;

    // Skip HTML — always fetch fresh (respects no-store on index.html)
    if (url.pathname.endsWith('.html') || url.pathname.endsWith('/')) return;

    // Cache hashed static assets (JS, CSS, fonts, images)
    // Exclude audio/video — range requests return 206 which Cache API rejects
    if (/\.(js|css|woff2?|ttf|png|jpg|jpeg|svg|webp)$/.test(url.pathname)) {
        event.respondWith(
            caches.open(CACHE_NAME).then(cache =>
                cache.match(event.request).then(cached => {
                    if (cached) return cached;
                    return fetch(event.request).then(response => {
                        if (response.ok) cache.put(event.request, response.clone());
                        return response;
                    });
                })
            )
        );
    }
});
