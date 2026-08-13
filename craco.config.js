const path = require('path');

module.exports = {
  webpack: {
    configure: (config) => {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        module: false,
        fs: false,
        path: false,
      };
      config.resolve.alias = {
        ...config.resolve.alias,
        'vad-asr.wasm': path.resolve(
          __dirname,
          'node_modules/@sherpaw/vad-asr/dist/prebuilt/vad-asr.wasm',
        ),
      };

      // The WASM runtime is loaded only when local recognition is selected.
      // Keep it out of Workbox's eager precache; the service worker caches it
      // on first use through the CacheFirst route in service-worker.ts.
      const injectManifest = config.plugins.find(
        (plugin) => plugin?.constructor?.name === 'InjectManifest',
      );
      if (injectManifest) {
        injectManifest.config.exclude = [
          ...(injectManifest.config.exclude || []),
          /\.wasm$/,
        ];
      }
      return config;
    },
  },
};
