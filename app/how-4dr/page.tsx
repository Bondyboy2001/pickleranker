import type { Metadata } from 'next'
import { ClientPage } from '../client-page'

export const metadata: Metadata = {
  title: 'How 4DR Works',
  description:
    'How the David Lloyd Cardiff 4DR doubles rating works: team average, upset factor, margin bonus and a worked 11-6 example.',
  alternates: { canonical: '/how-4dr' },
  openGraph: {
    title: 'How 4DR Works | David Lloyd Cardiff Pickleball',
    description: 'The four-step doubles rating: team average, upset factor, margin and loser credit.',
    url: '/how-4dr',
    type: 'website',
  },
}

export default function How4drPage() {
  return <ClientPage />
}
