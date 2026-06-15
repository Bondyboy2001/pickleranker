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
    icon: '/favicon.svg',
  },
  openGraph: {
    title: 'David Lloyd Cardiff Pickleball Leaderboard',
    description: 'Live 4DR rankings, weekly session results, and player rating history.',
    type: 'website',
    url: '/',
    images: ['/david-lloyd-pickleball-logo.png'],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/david-lloyd-pickleball-logo.png'],
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
