import type { Metadata } from 'next'
import { ClientPage } from '../client-page'

export const metadata: Metadata = {
  title: 'Weekly Results',
  description:
    'David Lloyd Cardiff weekly pickleball results: biggest movers, 4DR change and rank movement by session.',
  alternates: { canonical: '/weekly' },
  openGraph: {
    title: 'Weekly Pickleball Results | David Lloyd Cardiff',
    description: 'Session-by-session 4DR change, biggest movers and game breakdowns.',
    url: '/weekly',
    type: 'website',
  },
}

export default function WeeklyPage() {
  return <ClientPage />
}
