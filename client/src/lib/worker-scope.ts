import { isDashboardPath } from './dashboard-paths';

export const orgScope = (org: string) => `/${org}/`;

// Never `/` on a public page: the public host's other pages belong to another site.
export function workerScope(pathname: string): string | null {
  const first = pathname.split('/')[1] ?? '';
  if (isDashboardPath(pathname)) return '/';
  return first && first !== 'privacy' ? orgScope(first) : null;
}
