/**
 * Director view: the audit log of the whole organization (every site). The
 * backend scopes it to the caller's organization and requires MFA.
 */
import { useEffect, useState } from 'react';
import { Shield } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { PageHeader, EmptyState } from './ui';

interface AuditEntry {
  id: number;
  user_email: string | null;
  action: string;
  target_type: string | null;
  target_id: number | null;
  created_at: string | null;
}

export function OrgAuditPage() {
  const [logs, setLogs] = useState<AuditEntry[] | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    adminApi
      .getAuditLogs({ per_page: 50 })
      .then((d) => setLogs(d.logs ?? []))
      .catch((err) => {
        if (err?.response?.status === 403) setDenied(true);
        setLogs([]);
      });
  }, []);

  return (
    <div>
      <PageHeader title="Audit" description="Journal des actions de votre organisation" />

      {logs === null ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : denied ? (
        <EmptyState
          icon={Shield}
          title="Authentification à deux facteurs requise"
          description="La consultation du journal d’audit nécessite d’avoir activé le MFA sur votre compte."
        />
      ) : logs.length === 0 ? (
        <EmptyState
          icon={Shield}
          title="Aucune activité"
          description="Les actions sensibles apparaîtront ici."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">Utilisateur</th>
                <th className="px-4 py-2.5 font-medium">Action</th>
                <th className="px-4 py-2.5 font-medium">Cible</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-t border-border">
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-muted-foreground">
                    {l.created_at ? new Date(l.created_at).toLocaleString('fr-FR') : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-foreground">{l.user_email ?? 'Système'}</td>
                  <td className="px-4 py-2.5">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">
                      {l.action}
                    </code>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {l.target_type
                      ? `${l.target_type}${l.target_id ? ` #${l.target_id}` : ''}`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
