/** @type {import('next').NextConfig} */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
const nextPublicAbyssLoadingSeed = String(Date.now() >>> 0);

const nextConfig = {
  reactStrictMode: true,
  output: 'export',
  env: {
    NEXT_PUBLIC_ABYSS_LOADING_SEED: nextPublicAbyssLoadingSeed,
  },
  turbopack: {
    rules: {
      '*.prompt': {
        loaders: ['raw-loader'],
        as: '*.js',
      },
    },
  },
  ...(basePath
    ? {
        basePath,
        assetPrefix: basePath,
      }
    : {}),
  trailingSlash: true,
}

export default nextConfig
