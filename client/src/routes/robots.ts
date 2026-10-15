import type { LoaderFunctionArgs } from 'react-router';
import { publicOrigin } from '@/lib/api/public.server';
import { robotsTxt } from '@/pages/public/seo/robots';

export function loader({ request }: LoaderFunctionArgs) {
  return new Response(robotsTxt(publicOrigin(request)), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
