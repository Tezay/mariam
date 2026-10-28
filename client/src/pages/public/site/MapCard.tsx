import { useEffect, useRef } from 'react';
import { Navigation } from 'lucide-react';
import type { Map as LeafletMap } from 'leaflet';
import type { MapTiles } from '@/lib/runtime-config';
import { cn } from '@/lib/utils';
import type { RestaurantPublic } from '../menu-types';
import { addressLines, directionsUrl } from './address';

const PIN = `<svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor" stroke="#fff" stroke-width="1.5" class="text-site-brand-solid" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3" fill="#fff"/></svg>`;

function SiteMap({ lat, lon, tiles }: { lat: number; lon: number; tiles: MapTiles }) {
  const element = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = element.current;
    if (!container) return;
    let map: LeafletMap | undefined;
    let gone = false;
    const observer = new IntersectionObserver(
      async (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        const [{ default: L }] = await Promise.all([
          import('leaflet'),
          import('leaflet/dist/leaflet.css'),
        ]);
        if (gone) return;
        map = L.map(container, {
          center: [lat, lon],
          zoom: 16,
          scrollWheelZoom: false,
          dragging: !L.Browser.mobile,
          attributionControl: false,
        });
        L.control.attribution({ prefix: false }).addTo(map);
        L.tileLayer(tiles.url, { attribution: tiles.attribution, maxZoom: 19 }).addTo(map);
        L.marker([lat, lon], {
          icon: L.divIcon({ html: PIN, className: '', iconSize: [36, 36], iconAnchor: [18, 36] }),
          keyboard: false,
          interactive: false,
        }).addTo(map);
      },
      { rootMargin: '200px' }
    );
    observer.observe(container);
    return () => {
      gone = true;
      observer.disconnect();
      map?.remove();
    };
  }, [lat, lon, tiles.url, tiles.attribution]);

  // `isolate` keeps Leaflet's panes under the page's dialogs.
  return (
    <div
      ref={element}
      role="img"
      aria-label="Carte de l'emplacement du restaurant"
      className="relative isolate h-[180px] w-full bg-site-placeholder lg:h-[220px]"
    />
  );
}

function Directions({ href, className }: { href: string; className: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-site-brand-solid px-3.5 text-sm font-bold text-white transition-opacity hover:opacity-90',
        className
      )}
    >
      <Navigation aria-hidden className="h-4 w-4" />
      S'y rendre
    </a>
  );
}

export function MapCard({ site, tiles }: { site: RestaurantPublic; tiles: MapTiles | null }) {
  const address = addressLines(site);
  const directions = directionsUrl(site);
  if (!address && !site.access_info) return null;
  const { address_lat: lat, address_lon: lon } = site;

  return (
    <div className="overflow-hidden rounded-[20px] border border-site-line bg-site-surface">
      {tiles && lat != null && lon != null && <SiteMap lat={lat} lon={lon} tiles={tiles} />}
      <div className="flex flex-col gap-3 p-4 lg:px-5 lg:pb-5">
        <div className="flex items-center justify-between gap-3">
          {address && (
            <address className="not-italic">
              <span className="block font-semibold">{address.street}</span>
              {address.locality && (
                <span className="block text-[13px] text-site-subtle lg:text-sm">
                  {address.locality}
                </span>
              )}
            </address>
          )}
          {directions && <Directions href={directions} className="lg:hidden" />}
        </div>
        {site.access_info && (
          <p className="whitespace-pre-line text-[13px] text-site-subtle lg:text-sm">
            {site.access_info}
          </p>
        )}
        {directions && <Directions href={directions} className="hidden lg:flex" />}
      </div>
    </div>
  );
}
