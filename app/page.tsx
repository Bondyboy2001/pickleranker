import type { Metadata } from 'next'
import { ClientPage } from './client-page'

export const metadata: Metadata = {
  title: 'Overall Leaderboard',
  description:
    'Live David Lloyd Cardiff pickleball standings: 4DR ratings, wins, win rate and rank movement.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'David Lloyd Cardiff Pickleball Leaderboard',
    description: 'Live 4DR rankings, weekly session results, and player rating history.',
    url: '/',
    type: 'website',
  },
}

export default function Page() {
  return <ClientPage />
}
