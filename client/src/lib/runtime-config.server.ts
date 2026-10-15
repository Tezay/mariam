type Env = Record<string, string | undefined>;

// Served to every browser at /config.js: no secret belongs here.
export function publicRuntimeConfig(env: Env = process.env) {
  return {
    API_URL: env.API_URL || '/v1',
    APP_VERSION: env.APP_VERSION || 'dev',
    CANONICAL_HOST: env.CANONICAL_HOST || '',
    UMAMI_SCRIPT_URL: env.UMAMI_SCRIPT_URL || '',
    UMAMI_WEBSITE_ID: env.UMAMI_WEBSITE_ID || '',
    SENTRY_DSN: env.SENTRY_DSN || '',
    SENTRY_ENVIRONMENT:
      env.SENTRY_ENVIRONMENT || (env.NODE_ENV === 'production' ? 'production' : 'development'),
  };
}

export function runtimeConfigScript(env: Env = process.env): string {
  return `window.__RUNTIME_CONFIG__ = ${JSON.stringify(publicRuntimeConfig(env))};\n`;
}

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

export function contentSecurityPolicy(nonce: string, env: Env = process.env): string {
  const config = publicRuntimeConfig(env);
  const umami = originOf(config.UMAMI_SCRIPT_URL);
  const scripts = ["'self'", `'nonce-${nonce}'`, umami];
  const connections = ["'self'", originOf(config.API_URL), umami, originOf(config.SENTRY_DSN)];
  return [
    "default-src 'self'",
    `script-src ${scripts.filter(Boolean).join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    `connect-src ${connections.filter(Boolean).join(' ')}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}
