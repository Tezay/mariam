import type { Role } from '@/lib/api/user';

/** Landing dashboard for a role, shared by the login flow and the route guards. */
export function dashboardPathForRole(role: Role | undefined): string {
  return role === 'org_admin' ? '/org' : '/admin';
}

/** The account page is mounted under both dashboards; pick the caller's own. */
export function accountPathForRole(role: Role | undefined): string {
  return `${dashboardPathForRole(role)}/account`;
}

/** Each account installs the app of its own dashboard, whose manifest this page names. */
export function installPathForRole(role: Role | undefined): string {
  return `${dashboardPathForRole(role)}/install`;
}
