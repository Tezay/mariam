import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SiteLinkIcon } from '@/components/SiteLinkIcon';
import {
  LINK_KINDS,
  LINKS_MAX,
  TEXT_MAX,
  linkKind,
  type LinkKind,
  type SiteLink,
} from '@/lib/site-profile';
import { IconButton } from './IconButton';
import type { PublicPageState } from './usePublicPageState';

export function LinksField({ state }: { state: PublicPageState }) {
  const { form, update, linkProblems, showLinkProblems } = state;
  if (!form) return null;
  const links = form.links;
  const taken = new Set<LinkKind>(
    links.map((link) => link.kind).filter((kind) => kind !== 'website')
  );

  const replace = (next: SiteLink[]) => update({ links: next });
  const change = (index: number, changes: Partial<SiteLink>) =>
    replace(links.map((link, i) => (i === index ? { ...link, ...changes } : link)));
  const move = (index: number, step: -1 | 1) => {
    const next = [...links];
    [next[index], next[index + step]] = [next[index + step], next[index]];
    replace(next);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Site du Crous, Izly, réseaux sociaux : {LINKS_MAX} liens au plus, dans l'ordre où ils
        s'affichent.
      </p>

      {links.length > 0 && (
        <ol className="space-y-3">
          {links.map((link, index) => {
            const problem = linkProblems[index];
            const shown = problem && (showLinkProblems || link.url.trim() !== '');
            return (
              <li key={index} className="space-y-2 rounded-xl border border-border p-3">
                <div className="flex items-center gap-2">
                  <SiteLinkIcon kind={link.kind} className="text-muted-foreground" />
                  <select
                    aria-label="Type de lien"
                    value={link.kind}
                    onChange={(event) => {
                      const kind = event.target.value as LinkKind;
                      change(index, {
                        kind,
                        label: kind === 'website' ? (link.label ?? '') : null,
                      });
                    }}
                    className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                  >
                    {LINK_KINDS.map((kind) => (
                      <option
                        key={kind.id}
                        value={kind.id}
                        disabled={kind.id !== link.kind && taken.has(kind.id)}
                      >
                        {kind.label}
                      </option>
                    ))}
                  </select>
                  <IconButton label="Monter" disabled={index === 0} onClick={() => move(index, -1)}>
                    <ArrowUp />
                  </IconButton>
                  <IconButton
                    label="Descendre"
                    disabled={index === links.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown />
                  </IconButton>
                  <IconButton
                    label="Retirer le lien"
                    onClick={() => replace(links.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="text-destructive" />
                  </IconButton>
                </div>

                <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
                  {link.kind === 'website' && (
                    <div className="space-y-1">
                      <Label htmlFor={`link-${index}-label`} className="text-xs">
                        Nom affiché
                      </Label>
                      <Input
                        id={`link-${index}-label`}
                        value={link.label ?? ''}
                        maxLength={TEXT_MAX.linkLabel}
                        onChange={(event) => change(index, { label: event.target.value })}
                      />
                    </div>
                  )}
                  <div
                    className={link.kind === 'website' ? 'space-y-1' : 'space-y-1 sm:col-span-2'}
                  >
                    <Label htmlFor={`link-${index}-url`} className="text-xs">
                      {link.kind === 'website'
                        ? 'Adresse'
                        : `Adresse de la page ${linkKind(link.kind).label}`}
                    </Label>
                    <Input
                      id={`link-${index}-url`}
                      type="url"
                      inputMode="url"
                      value={link.url}
                      aria-invalid={shown ? true : undefined}
                      onChange={(event) => change(index, { url: event.target.value })}
                    />
                  </div>
                </div>
                {shown && <p className="text-xs text-destructive">{problem}</p>}
              </li>
            );
          })}
        </ol>
      )}

      <Button
        size="sm"
        variant="outline"
        disabled={links.length >= LINKS_MAX}
        onClick={() => replace([...links, { kind: 'website', url: '', label: '' }])}
      >
        <Plus />
        Ajouter un lien
      </Button>
    </div>
  );
}
