import { cn } from '@/lib/utils';
import type { RestaurantPublic } from '../menu-types';
import { Gallery } from './Gallery';

function paragraphs(text: string | null): string[] {
  return (text ?? '').split(/\n{2,}/).filter((paragraph) => paragraph.trim() !== '');
}

/** On a wide screen the cover and the tagline sit in the header instead. */
export function AboutSection({ site }: { site: RestaurantPublic }) {
  const description = paragraphs(site.description);
  const wide = description.length > 0 || site.photos.length > 0;
  if (!wide && !site.cover_url && !site.tagline) return null;

  return (
    <section
      aria-labelledby="about-title"
      className={cn('flex flex-col gap-3 lg:gap-4', !wide && 'lg:hidden')}
    >
      <h2 id="about-title" className="text-lg font-bold lg:text-2xl lg:tracking-tight">
        Le restaurant
      </h2>
      {site.cover_url && (
        <img
          src={site.cover_url}
          alt=""
          className="h-[200px] w-full rounded-[20px] object-cover lg:hidden"
        />
      )}
      {site.tagline && <p className="text-[15px] font-semibold lg:hidden">{site.tagline}</p>}
      {description.map((paragraph, index) => (
        <p key={index} className="max-w-[44rem] whitespace-pre-line text-site-subtle">
          {paragraph}
        </p>
      ))}
      <Gallery photos={site.photos} />
    </section>
  );
}
