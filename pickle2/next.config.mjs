import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import withPWAInit from '@ducanh2912/next-pwa'

const __dirname = dirname(fileURLToPath(import.meta.url))

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
  reactStrictMode: true,
  // pickle2 lives inside the existing repo (which has its own lockfile);
  // pin the tracing root to this folder so file tracing is correct.
  outputFileTracingRoot: __dirname,
  // The original Vite build did not run ESLint as part of `build`
  // (`tsc -b && vite build`); keep that behavior. Use `npm run lint` to lint.
  eslint: {
    ignoreDuringBuilds: true,
  },
}

export default withPWA(nextConfig)
