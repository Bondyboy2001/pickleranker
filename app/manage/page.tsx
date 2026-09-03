import type { Metadata } from 'next'
import { ClientPage } from '../client-page'

export const metadata: Metadata = {
  title: 'Manage',
  robots: { index: false, follow: false },
}

export default function ManagePage() {
  return <ClientPage />
}
