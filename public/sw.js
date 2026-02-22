// Service worker for Echo Chore Calendar
// Strategy: cache hashed Vite assets (JS/CSS/fonts/images) aggressively.
// HTML files are intentionally NOT cached — the app uses no-store headers
// on index.html and we want fresh content on every visit.

const CACHE_NAME = 'chore-calendar-v1';
const MAX_CACHE_ENTRIES = 50;

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

// Evict the oldest entries when the cache exceeds MAX_CACHE_ENTRIES.
// Vite assets use content hashes, so each deployment produces new URLs
// and old entries are never requested again.
function trimCache(cache) {
    return cache.keys().then(keys => {
        if (keys.length <= MAX_CACHE_ENTRIES) return;
        // Delete oldest entries first (Cache API returns keys in insertion order)
        const toDelete = keys.slice(0, keys.length - MAX_CACHE_ENTRIES);
        return Promise.all(toDelete.map(key => cache.delete(key)));
    });
}

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
                        if (response.ok) {
                            cache.put(event.request, response.clone());
                            trimCache(cache);
                        }
                        return response;
                    });
                })
            )
        );
    }
});
