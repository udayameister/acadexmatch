import type { Metadata } from 'next';
import RequireRole from '@/components/RequireRole';

// Private area: never shown in search results.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <RequireRole roles={['candidate']}>{children}</RequireRole>;
}
