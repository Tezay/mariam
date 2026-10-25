import { parisToday } from '../date-utils';
import { api, scopePath, type OrgRef, type SiteRef } from './client';
import type { components } from './schema.gen';

export type AuditLog = components['schemas']['AuditLog'];

/** One site, or the organization with its supervisors' own entries. */
export type AuditScope = SiteRef | OrgRef;

export interface AuditFilters {
  action?: string;
  user_id?: number;
  from?: string;
  to?: string;
  /** A site's slug; the organization's scope only. */
  site?: string;
}

export interface AuditPage {
  items: AuditLog[];
  total_count: number;
}

export const auditApi = {
  list: async (
    scope: AuditScope,
    filters: AuditFilters & { page?: number; per_page?: number } = {}
  ): Promise<AuditPage> =>
    (await api.get(`${scopePath(scope)}/audit-logs`, { params: filters })).data,

  export: async (scope: AuditScope, filters: AuditFilters = {}): Promise<void> => {
    const response = await api.get(`${scopePath(scope)}/audit-logs/export`, {
      params: filters,
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([response.data], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit_logs_${parisToday()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },
};
