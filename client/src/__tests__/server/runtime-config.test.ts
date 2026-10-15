import { describe, it, expect } from 'vitest';
import { contentSecurityPolicy, publicRuntimeConfig } from '@/lib/runtime-config.server';

function directive(policy: string, name: string) {
  return policy.split('; ').find((part) => part.startsWith(`${name} `));
}

describe('contentSecurityPolicy', () => {
  it('names no third party when none is configured', () => {
    const policy = contentSecurityPolicy('abc', {});
    expect(directive(policy, 'script-src')).toBe("script-src 'self' 'nonce-abc'");
    expect(directive(policy, 'connect-src')).toBe("connect-src 'self'");
  });

  it('lets the browser reach an API on a host of its own', () => {
    const policy = contentSecurityPolicy('abc', { API_URL: 'https://api.example.test/v1' });
    expect(directive(policy, 'connect-src')).toBe("connect-src 'self' https://api.example.test");
  });

  it('takes the Sentry host from the DSN, without its key', () => {
    const policy = contentSecurityPolicy('abc', {
      SENTRY_DSN: 'https://key@errors.example.test/1',
    });
    expect(directive(policy, 'connect-src')).toBe("connect-src 'self' https://errors.example.test");
    expect(policy).not.toContain('key@');
  });
});

describe('publicRuntimeConfig', () => {
  it('leaves the rest of the environment out', () => {
    const config = publicRuntimeConfig({
      API_URL: '/v1',
      API_INTERNAL_URL: 'http://backend:5000/v1',
    });
    expect(JSON.stringify(config)).not.toContain('backend');
  });

  it('names the environment after the build when none is given', () => {
    expect(publicRuntimeConfig({ NODE_ENV: 'production' }).SENTRY_ENVIRONMENT).toBe('production');
    expect(publicRuntimeConfig({}).SENTRY_ENVIRONMENT).toBe('development');
    expect(publicRuntimeConfig({ SENTRY_ENVIRONMENT: 'staging' }).SENTRY_ENVIRONMENT).toBe(
      'staging'
    );
  });
});
