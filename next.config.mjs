/** @type {import('next').NextConfig} */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
const nextPublicAbyssLoadingSeed = String(Date.now() >>> 0);

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@abyss/generation-contracts'],
  output: 'export',
  env: {
    NEXT_PUBLIC_ABYSS_LOADING_SEED: nextPublicAbyssLoadingSeed,
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
