import type { User } from '@/lib/api';

type Role = User['role'] | undefined;

/** Landing dashboard for a role, shared by the login flow and the route guards. */
export function dashboardPathForRole(role: Role): string {
  return role === 'org_admin' ? '/org' : '/admin';
}

/** The account page is mounted under both dashboards; pick the caller's own. */
export function accountPathForRole(role: Role): string {
  return `${dashboardPathForRole(role)}/account`;
}
