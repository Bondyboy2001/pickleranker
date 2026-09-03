import type { Metadata } from 'next'
import { ClientPage } from '../client-page'

export const metadata: Metadata = {
  title: 'Player Profiles',
  description:
    'Search David Lloyd Cardiff pickleball players: rating history, head-to-head records, best partners and form.',
  alternates: { canonical: '/players' },
  openGraph: {
    title: 'Player Profiles | David Lloyd Cardiff Pickleball',
    description: 'Rating history, head-to-head and form for every club player.',
    url: '/players',
    type: 'website',
  },
}

export default function PlayersPage() {
  return <ClientPage />
}
