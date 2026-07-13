import withPWAInit from '@ducanh2912/next-pwa'

const withPWA = withPWAInit({
  dest: 'public',
  register: true,
  cacheOnFrontEndNav: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === 'development',
  workboxOptions: {
    navigateFallback: '/',
  },
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit a fully static site (HTML/CSS/JS) to `out/`. The app is client-rendered
  // and talks to Supabase directly from the browser, so no server runtime is
  // required. Cloudflare Pages serves this export from the `out/` directory.
  output: 'export',
  trailingSlash: true,
  reactStrictMode: true,
  // Static export has no Image Optimization server; serve images as-is.
  images: {
    unoptimized: true,
  },
  // ESLint is run separately via `npm run lint`, not as part of the build.
  eslint: {
    ignoreDuringBuilds: true,
  },
}

export default withPWA(nextConfig)
