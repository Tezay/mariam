/**
 * Site switcher for an organization director (org_admin): picks which site of
 * the organization the admin acts on. The choice is sent as X-Restaurant-Id on
 * every authenticated request (see lib/api.ts).
 */
import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import {
  restaurantApi,
  getActiveRestaurantId,
  setActiveRestaurantId,
  type AdminSite,
} from '@/lib/api';

export function SiteSelector() {
  const [sites, setSites] = useState<AdminSite[]>([]);
  const [active, setActive] = useState<number | null>(getActiveRestaurantId());

  useEffect(() => {
    let cancelled = false;
    restaurantApi
      .list()
      .then((s) => {
        if (cancelled) return;
        setSites(s);
        if (getActiveRestaurantId() == null && s.length > 0) {
          setActiveRestaurantId(s[0].id);
          setActive(s[0].id);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (sites.length <= 1) return null;

  const onChange = (id: number) => {
    setActiveRestaurantId(id);
    setActive(id);
    // Reload so every admin view refetches for the newly selected site.
    window.location.reload();
  };

  return (
    <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-2">
      <Building2 className="h-4 w-4 text-muted-foreground" />
      <label htmlFor="site-selector" className="text-sm text-muted-foreground">
        Site
      </label>
      <select
        id="site-selector"
        value={active ?? ''}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded-xl border border-input bg-background px-3 py-1.5 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {sites.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  );
}
