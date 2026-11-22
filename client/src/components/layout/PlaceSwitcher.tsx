import { useNavigate } from 'react-router';
import { Building2, Check, ChevronsUpDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/contexts/AuthContext';
import { useOptionalPlace } from '@/contexts/PlaceContext';
import { orgPath, placeGroups, placeName, placesOf, sitePath } from '@/lib/dashboard-routes';
import { roleLabel } from '@/lib/roles';

interface Chip {
  label: string;
  name: string;
}

function FullChip({ chip, switchable }: { chip: Chip; switchable: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-[10px] bg-muted px-2.5 py-2" title={chip.name}>
      <div className="min-w-0 flex-1 text-left">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {chip.label}
        </p>
        <p className="truncate text-sm font-semibold text-foreground">{chip.name}</p>
      </div>
      {switchable && <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
    </div>
  );
}

function SmallChip({ chip }: { chip: Chip }) {
  return (
    <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-[10px] bg-muted text-xs font-semibold text-foreground">
      {chip.name.charAt(0).toUpperCase()}
    </div>
  );
}

interface PlaceSwitcherProps {
  collapsed?: boolean;
  /** Called once a place is chosen, to close the mobile menu around it. */
  onChoose?: () => void;
}

export function PlaceSwitcher({ collapsed = false, onChoose }: PlaceSwitcherProps) {
  const { user } = useAuth();
  const current = useOptionalPlace();
  const navigate = useNavigate();
  if (!user || !current) return null;

  const groups = placeGroups(user);
  const chip = {
    label: current.place.kind === 'org' ? 'Organisation' : 'Site',
    name: placeName(user, current.place),
  };
  const switchable = placesOf(user).length > 1;

  if (!switchable) {
    if (!collapsed) return <FullChip chip={chip} switchable={false} />;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div>
            <SmallChip chip={chip} />
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {chip.label} · {chip.name}
        </TooltipContent>
      </Tooltip>
    );
  }

  const go = (path: string) => {
    navigate(path);
    onChoose?.();
  };
  const here = current.place;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="w-full rounded-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`${chip.label} : ${chip.name}. Changer de restaurant ou d'organisation`}
        >
          {collapsed ? <SmallChip chip={chip} /> : <FullChip chip={chip} switchable />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side={collapsed ? 'right' : 'bottom'} className="w-64">
        {groups.map((group, index) => (
          <DropdownMenuGroup key={group.organization.slug}>
            {index > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              {group.organization.name}
            </DropdownMenuLabel>
            {group.supervised && (
              <DropdownMenuItem
                className="gap-2"
                onSelect={() => go(orgPath(group.organization.slug))}
              >
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1">Supervision</span>
                {here.kind === 'org' && here.org === group.organization.slug && (
                  <Check className="h-4 w-4 text-primary" />
                )}
              </DropdownMenuItem>
            )}
            {group.sites.map((site) => (
              <DropdownMenuItem
                key={site.slug}
                className="gap-2"
                onSelect={() => go(sitePath({ org: group.organization.slug, site: site.slug }))}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate">{site.name}</p>
                  <p className="text-xs text-muted-foreground">{roleLabel(site.role)}</p>
                </div>
                {here.kind === 'site' &&
                  here.org === group.organization.slug &&
                  here.site === site.slug && <Check className="h-4 w-4 text-primary" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
