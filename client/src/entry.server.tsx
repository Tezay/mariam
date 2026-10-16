import { randomBytes } from 'node:crypto';
import { PassThrough } from 'node:stream';

import type { EntryContext, HandleErrorFunction } from 'react-router';
import { createReadableStreamFromReadable } from '@react-router/node';
import { isRouteErrorResponse, ServerRouter } from 'react-router';
import { isbot } from 'isbot';
import type { RenderToPipeableStreamOptions } from 'react-dom/server';
import { renderToPipeableStream } from 'react-dom/server';
import { contentSecurityPolicy } from './lib/runtime-config.server';

export const streamTimeout = 5_000;

export const handleError: HandleErrorFunction = (error, { request }) => {
  // Neither a visitor who leaves mid-render nor a request the router turns away
  // (a POST to a page answers 405) is a server error.
  if (request.signal.aborted || isRouteErrorResponse(error)) return;
  console.error(`${request.method} ${new URL(request.url).pathname}`, error);
};

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext
) {
  // No policy in development, where Vite injects scripts of its own. Report-only for now.
  const nonce = import.meta.env.PROD ? randomBytes(16).toString('base64') : undefined;
  if (nonce) {
    responseHeaders.set('Content-Security-Policy-Report-Only', contentSecurityPolicy(nonce));
  }

  if (request.method.toUpperCase() === 'HEAD') {
    return new Response(null, { status: responseStatusCode, headers: responseHeaders });
  }

  return new Promise((resolve, reject) => {
    let shellRendered = false;
    const userAgent = request.headers.get('user-agent');

    // A crawler gets the whole page at once rather than a stream it may not wait for.
    const readyOption: keyof RenderToPipeableStreamOptions =
      userAgent && isbot(userAgent) ? 'onAllReady' : 'onShellReady';

    // One second past the stream timeout, so rejected boundaries are flushed first.
    let timeoutId: ReturnType<typeof setTimeout> | undefined = setTimeout(
      () => abort(),
      streamTimeout + 1000
    );

    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={routerContext} url={request.url} nonce={nonce} />,
      {
        nonce,
        [readyOption]() {
          shellRendered = true;
          const body = new PassThrough({
            final(callback) {
              clearTimeout(timeoutId);
              timeoutId = undefined;
              callback();
            },
          });

          responseHeaders.set('Content-Type', 'text/html');
          pipe(body);
          resolve(
            new Response(createReadableStreamFromReadable(body), {
              headers: responseHeaders,
              status: responseStatusCode,
            })
          );
        },
        onShellError(error: unknown) {
          reject(error);
        },
        onError(error: unknown) {
          responseStatusCode = 500;
          // An error in the shell itself rejects above and is logged there.
          if (shellRendered) {
            console.error(error);
          }
        },
      }
    );
  });
}
