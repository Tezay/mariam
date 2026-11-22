import { PUBLIC_URL } from './runtime-config';

export function publicPageUrl(org: string, site?: string): string {
  return `${PUBLIC_URL}/${org}${site ? `/${site}` : ''}`;
}
