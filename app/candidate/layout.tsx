import RequireRole from '@/components/RequireRole';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <RequireRole roles={['candidate']}>{children}</RequireRole>;
}
