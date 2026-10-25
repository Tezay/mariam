import { useAuth } from '@/contexts/AuthContext';
import type { OrgRef } from '@/lib/api/client';

export function useOrgRef(): OrgRef | null {
  const { user } = useAuth();
  return user?.organization_slug ? { org: user.organization_slug } : null;
}
