import type { LoaderFunctionArgs } from 'react-router';
import { publicOrigin } from '@/lib/api/public.server';
import { hostsOf, isDashboardHost } from '@/lib/hosts.server';
import { robotsTxt } from '@/pages/public/seo/robots';

const CLOSED = 'User-agent: *\nDisallow: /\n';

export function loader({ request }: LoaderFunctionArgs) {
  const closed = isDashboardHost(new URL(request.url), hostsOf());
  return new Response(closed ? CLOSED : robotsTxt(publicOrigin(request)), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
