import type { Metadata } from 'next';
import RequireRole from '@/components/RequireRole';
import InstituteSubscriptionGate from '@/components/InstituteSubscriptionGate';

// Private area: never shown in search results.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole roles={['institute_admin', 'recruiter']}>
      <InstituteSubscriptionGate>{children}</InstituteSubscriptionGate>
    </RequireRole>
  );
}
