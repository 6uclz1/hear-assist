/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<unknown> };

clientsClaim();
self.skipWaiting();
precacheAndRoute(self.__WB_MANIFEST);

const fileExtensionRegexp = new RegExp('/[^/?]+\\.[^/]+$');
const scopePath = new URL(self.registration.scope).pathname.replace(/\/$/, '');

registerRoute(
  ({ request, url }) => request.mode === 'navigate'
    && !url.pathname.startsWith('/_')
    && !url.pathname.match(fileExtensionRegexp),
  createHandlerBoundToURL(`${scopePath}/index.html`),
);

registerRoute(
  ({ url }) => url.origin === self.location.origin
    && (url.pathname.includes('/models/reazonspeech/') || url.pathname.endsWith('.wasm')),
  new CacheFirst({
    cacheName: 'reazonspeech-v2',
    plugins: [new ExpirationPlugin({ maxEntries: 8, maxAgeSeconds: 30 * 24 * 60 * 60 })],
  }),
);

registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.endsWith('.png'),
  new StaleWhileRevalidate({
    cacheName: 'images',
    plugins: [new ExpirationPlugin({ maxEntries: 50 })],
  }),
);
