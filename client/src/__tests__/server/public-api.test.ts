import { describe, it, expect } from 'vitest';
import { apiBaseUrl, forwardedHeaders } from '@/lib/api/public.server';

const page = (headers: Record<string, string> = {}) =>
  new Request('http://demo.example.test/menu', { headers });

describe('apiBaseUrl', () => {
  it('prefers the private address', () => {
    const env = {
      API_URL: 'https://api.example.test/v1',
      API_INTERNAL_URL: 'http://backend:5000/v1/',
    };
    expect(apiBaseUrl(page(), env)).toBe('http://backend:5000/v1');
  });

  it('falls back on the address browsers call', () => {
    expect(apiBaseUrl(page(), { API_URL: 'https://api.example.test/v1' })).toBe(
      'https://api.example.test/v1'
    );
  });

  it('resolves a relative address against the requested host', () => {
    expect(apiBaseUrl(page(), {})).toBe('https://demo.example.test/v1');
  });
});

describe('forwardedHeaders', () => {
  it('names the tenant by the origin the visitor asked for', () => {
    expect(forwardedHeaders(page()).Origin).toBe('https://demo.example.test');
  });

  it('passes on the visitor address the proxy established', () => {
    const headers = { 'X-Real-IP': '203.0.113.7' };
    expect(forwardedHeaders(page(headers))['X-Real-IP']).toBe('203.0.113.7');
  });

  it('claims no address when it was given none', () => {
    expect(forwardedHeaders(page())).not.toHaveProperty('X-Real-IP');
  });
});
