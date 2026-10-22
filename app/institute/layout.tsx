import RequireRole from '@/components/RequireRole';
import InstituteSubscriptionGate from '@/components/InstituteSubscriptionGate';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole roles={['institute_admin', 'recruiter']}>
      <InstituteSubscriptionGate>{children}</InstituteSubscriptionGate>
    </RequireRole>
  );
}
