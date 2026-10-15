import { runtimeConfigScript } from '@/lib/runtime-config.server';

export function loader() {
  return new Response(runtimeConfigScript(), {
    headers: {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
