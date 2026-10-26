import { useAuth } from '@/contexts/AuthContext';
import type { OrgRef } from '@/lib/api/client';

export function useOrgRef(): OrgRef | null {
  const { user } = useAuth();
  return user?.organization ? { org: user.organization.slug } : null;
}
