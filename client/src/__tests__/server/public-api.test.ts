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

  it('passes on the visitor address, the one Cloudflare gives first', () => {
    const headers = { 'CF-Connecting-IP': '203.0.113.7', 'X-Forwarded-For': '198.51.100.1' };
    expect(forwardedHeaders(page(headers))['X-Forwarded-For']).toBe('203.0.113.7');
  });

  it('keeps the first hop of a forwarding chain', () => {
    const headers = { 'X-Forwarded-For': '203.0.113.7, 10.0.0.2' };
    expect(forwardedHeaders(page(headers))['X-Forwarded-For']).toBe('203.0.113.7');
  });

  it('claims no address when it was given none', () => {
    expect(forwardedHeaders(page())).not.toHaveProperty('X-Forwarded-For');
  });
});
