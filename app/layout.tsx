import type { Metadata, Viewport } from 'next'
import '@fontsource/atkinson-hyperlegible/400.css'
import '@fontsource/atkinson-hyperlegible/700.css'
import '../src/index.css'
// Split from the former App.css monolith; this order preserves the cascade.
import '../src/styles/shell.css'
import '../src/styles/admin.css'
import '../src/styles/workspace.css'
import '../src/styles/tables.css'
import '../src/styles/tournament.css'
import '../src/styles/explainer.css'
import '../src/styles/footer.css'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'David Lloyd Cardiff Pickleball Leaderboard',
    template: '%s | David Lloyd Cardiff Pickleball',
  },
  description:
    'David Lloyd Cardiff pickleball leaderboard with 4DR ratings, weekly results, and player stats.',
  keywords: ['pickleball Cardiff', 'David Lloyd Cardiff', 'pickleball leaderboard', '4DR rating', 'pickleball Wales'],
  authors: [{ name: 'David Lloyd Cardiff Pickleball' }],
  alternates: { canonical: '/' },
  robots: { index: true, follow: true },
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
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#1a6b4f' },
    { media: '(prefers-color-scheme: dark)', color: '#0d2b21' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const clubJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SportsClub',
    name: 'David Lloyd Cardiff Pickleball',
    sport: 'Pickleball',
    url: siteUrl,
  }
  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(clubJsonLd) }}
        />
        {children}
      </body>
    </html>
  )
}
