import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api/client';
import { membersApi, type Member } from '@/lib/api/members';

const member = (id: number) => ({ id, email: `${id}@mariam.app` }) as Member;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the list of accounts', () => {
  it('reads every page until it holds them all', async () => {
    const pages = [[member(1), member(2)], [member(3)]];
    const get = vi.spyOn(api, 'get').mockImplementation(async (_url, config) => {
      const { page } = config?.params as { page: number };
      return { data: { items: pages[page - 1] ?? [], total_count: 3 } };
    });

    const members = await membersApi.list({ org: 'crous', site: 'nord' });

    expect(members.map((m) => m.id)).toEqual([1, 2, 3]);
    expect(get).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenCalledWith('/orgs/crous/sites/nord/members', {
      params: { page: 1, per_page: 200 },
    });
  });
});
