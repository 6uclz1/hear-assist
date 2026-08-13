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
      return config;
    },
  },
};
