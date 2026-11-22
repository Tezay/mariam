export const DASHBOARD_SEGMENTS = [
  'admin',
  'org',
  'login',
  'activate',
  'reset-password',
  'unsubscribe',
] as const;

export function isDashboardPath(pathname: string): boolean {
  const first = pathname.split('/')[1] ?? '';
  return (DASHBOARD_SEGMENTS as readonly string[]).includes(first);
}
