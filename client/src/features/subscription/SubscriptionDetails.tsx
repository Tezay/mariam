import { useState, type ComponentType } from 'react';
import {
  Activity,
  BellRing,
  BookOpen,
  Building2,
  CalendarDays,
  ChartColumn,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  Copy,
  ExternalLink,
  FileText,
  Globe,
  Mail,
  RefreshCw,
  ShieldCheck,
  SmilePlus,
  Tv,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SubscriptionPeriod } from '@/lib/api/subscriptions';
import { DOCUMENT_URLS, STATUS_PAGE_URL, SUPPORT_EMAIL } from '@/lib/runtime-config';
import { notify } from '@/lib/toast';
import {
  kindLabel,
  longDate,
  supportMailto,
  supportRequests,
  type Reference,
} from './subscription-view';

type Icon = ComponentType<{ className?: string }>;

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

const INCLUDED: [Icon, string][] = [
  [CalendarDays, 'Menus et calendrier de publication'],
  [BookOpen, 'Catalogue de plats'],
  [Globe, 'Page publique et application des étudiants'],
  [Tv, "Écran d'affichage"],
  [BellRing, 'Rappels de menu aux étudiants'],
  [SmilePlus, 'Votes et satisfaction'],
  [ChartColumn, 'Statistiques'],
  [Building2, 'Supervision de plusieurs sites'],
  [ShieldCheck, "Comptes de l'équipe et double authentification"],
  [RefreshCw, 'Mises à jour comprises'],
];

export function IncludedFeatures() {
  return (
    <Card title="Inclus dans votre abonnement">
      <ul className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
        {INCLUDED.map(([FeatureIcon, label]) => (
          <li key={label} className="flex items-center gap-3 text-sm text-foreground">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FeatureIcon className="h-3.5 w-3.5" />
            </span>
            {label}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8 shrink-0"
      aria-label={`Copier ${label}`}
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
    </Button>
  );
}

function ReferenceList({ rows }: { rows: Reference[] }) {
  return (
    <dl className="space-y-3">
      {rows.map(({ label, value, copyable }) => (
        <div key={label} className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-sm font-medium tabular-nums text-foreground [overflow-wrap:anywhere]">
              {value}
            </dd>
          </div>
          {copyable && <CopyButton value={value} label={label.toLowerCase()} />}
        </div>
      ))}
    </dl>
  );
}

export function SubscriptionReferences({
  rows,
  supportText,
}: {
  rows: Reference[];
  supportText: string;
}) {
  const billing = rows.filter((row) => row.billing);
  return (
    <Card title="Références">
      <ReferenceList rows={rows.filter((row) => !row.billing)} />
      {billing.length > 0 && (
        <details className="group mt-4 border-t border-border pt-3">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
            Facturation
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-3">
            <ReferenceList rows={billing} />
          </div>
        </details>
      )}
      <Button
        type="button"
        variant="outline"
        className="mt-4 w-full"
        onClick={() => {
          navigator.clipboard.writeText(supportText);
          notify.success('Références copiées', 'Collez-les dans votre message au support.');
        }}
      >
        <ClipboardCopy className="h-4 w-4" />
        Tout copier pour le support
      </Button>
    </Card>
  );
}

export function SupportCard({
  supportText,
  siteName,
  organization,
}: {
  supportText: string;
  siteName: string;
  organization: string;
}) {
  if (!SUPPORT_EMAIL && !STATUS_PAGE_URL) return null;
  return (
    <Card title="Besoin d'aide ?">
      <div className="grid gap-5 sm:grid-cols-2 sm:gap-6">
        <div className="space-y-3">
          {SUPPORT_EMAIL && (
            <>
              <p className="text-sm text-muted-foreground">
                Votre message part avec les références de ce site.
              </p>
              <Button asChild variant="outline" className="w-full">
                <a href={supportMailto(SUPPORT_EMAIL, `Question — ${siteName}`, '', supportText)}>
                  <Mail className="h-4 w-4" />
                  Écrire au support
                </a>
              </Button>
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm text-muted-foreground">
                  {SUPPORT_EMAIL}
                </span>
                <CopyButton value={SUPPORT_EMAIL} label="l'adresse du support" />
              </div>
            </>
          )}
          {STATUS_PAGE_URL && (
            <a
              href={STATUS_PAGE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-foreground hover:underline"
            >
              <Activity className="h-4 w-4 shrink-0 text-muted-foreground" />
              État du service
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
            </a>
          )}
        </div>
        {SUPPORT_EMAIL && (
          <div className="sm:border-l sm:border-border sm:pl-6">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Demandes courantes
            </p>
            <ul className="-mx-2 mt-1">
              {supportRequests(siteName, organization).map((request) => (
                <li key={request.label}>
                  <a
                    href={supportMailto(SUPPORT_EMAIL, request.subject, request.intro, supportText)}
                    className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 text-sm text-foreground hover:bg-muted"
                  >
                    {request.label}
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

const DOCUMENTS: [keyof typeof DOCUMENT_URLS, string][] = [
  ['terms', 'Conditions de service'],
  ['dpa', 'Accord de sous-traitance des données'],
  ['apiTerms', "Conditions d'utilisation de l'API"],
  ['sourceLicense', 'Licence du code source'],
];

export function DocumentsCard() {
  const documents = DOCUMENTS.filter(([key]) => DOCUMENT_URLS[key]);
  if (!documents.length) return null;

  return (
    <Card title="Documents">
      <ul className="space-y-2.5">
        {documents.map(([key, label]) => (
          <li key={key}>
            <a
              href={DOCUMENT_URLS[key]}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-foreground hover:underline"
            >
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              {label}
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
            </a>
          </li>
        ))}
      </ul>
      {DOCUMENT_URLS.sourceLicense && (
        <p className="mt-3 text-xs text-muted-foreground">
          L'abonnement donne accès au service hébergé ; il ne constitue pas une licence du code
          source.
        </p>
      )}
    </Card>
  );
}

export function PastPeriods({ periods }: { periods: SubscriptionPeriod[] }) {
  if (!periods.length) return null;
  return (
    <details className="rounded-xl border border-border bg-card p-5">
      <summary className="cursor-pointer text-sm font-semibold text-foreground">
        Périodes précédentes ({periods.length})
      </summary>
      <ul className="mt-4 divide-y divide-border">
        {periods.map((period) => (
          <li
            key={`${period.starts_on}-${period.kind}`}
            className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2.5 text-sm first:pt-0 last:pb-0"
          >
            <span className="font-medium text-foreground">{kindLabel(period.kind)}</span>
            <span className="text-muted-foreground">
              du {longDate(period.starts_on)} au {longDate(period.ends_on)}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
