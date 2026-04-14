const CACHE_PREFIX = "tuutuut-runtime";
const workerUrl = new URL(self.location.href);
const cacheVersion = workerUrl.searchParams.get("v") || "dev";
const CACHE_NAME = `${CACHE_PREFIX}-${cacheVersion}`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheKeys = await caches.keys();

      await Promise.all(
        cacheKeys.map((cacheKey) => {
          if (cacheKey.startsWith(`${CACHE_PREFIX}-`) && cacheKey !== CACHE_NAME) {
            return caches.delete(cacheKey);
          }

          return Promise.resolve(false);
        })
      );

      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(request.url);

  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  if (shouldBypassCache(requestUrl)) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(handleNetworkFirstRequest(request));
    return;
  }

  event.respondWith(
    shouldUseNetworkFirst(requestUrl) ? handleNetworkFirstRequest(request) : handleCacheFirstRequest(request)
  );
});

function shouldUseNetworkFirst(requestUrl) {
  return !requestUrl.pathname.includes("/assets/");
}

function shouldBypassCache(requestUrl) {
  return requestUrl.pathname.startsWith("/api/");
}

async function handleNetworkFirstRequest(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request);

    if (response.ok) {
      await cache.put(request, response.clone());
    }

    return response;
  } catch {
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    return new Response("Hors ligne", {
      status: 503,
      statusText: "Hors ligne",
      headers: {
        "Content-Type": "text/plain; charset=utf-8"
      }
    });
  }
}

async function handleCacheFirstRequest(request) {
  const cachedResponse = await caches.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  const response = await fetch(request);

  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }

  return response;
}
