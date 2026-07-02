import type { Metadata, Viewport } from 'next'
import '@fontsource/atkinson-hyperlegible/400.css'
import '@fontsource/atkinson-hyperlegible/700.css'
import '../src/index.css'
import '../src/App.css'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'David Lloyd Cardiff Pickleball Leaderboard',
  description:
    'David Lloyd Cardiff pickleball leaderboard with 4DR ratings, weekly results, and player stats.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'David Lloyd Cardiff Pickleball Leaderboard',
    description: 'Live 4DR rankings, weekly session results, and player rating history.',
    type: 'website',
    url: '/',
    images: [
      {
        url: '/social-preview.png',
        width: 1200,
        height: 630,
        alt: 'David Lloyd Cardiff Pickleball leaderboard preview',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/social-preview.png'],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1a6b4f',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
