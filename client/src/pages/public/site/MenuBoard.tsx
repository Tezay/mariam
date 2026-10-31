import { useState } from 'react';
import { Link } from 'react-router';
import { CalendarOff } from 'lucide-react';
import type { Closure } from '@/lib/api/closures';
import { CategorySection } from '../menu/CategorySection';
import { ChefNote } from '../menu/ChefNote';
import { TodayEvent } from '../menu/NewsSection';
import { ItemDetailSheet } from '../menu/ItemDetailSheet';
import { VoteCard } from '../menu/VoteCard';
import type { News } from '@/lib/api/news';
import type { MenuData, MenuItemData, RestaurantPublic } from '../menu-types';
import { DayNav } from './DayNav';
import { dayHref, dayLabel, isServed, longDay, type DayStrip } from './days';

function closureRange(closure: Closure): string {
  if (closure.start_date === closure.end_date) return `le ${longDay(closure.start_date)}`;
  return `du ${longDay(closure.start_date)} au ${longDay(closure.end_date)}`;
}

function DayMessage({
  date,
  today,
  site,
  closure,
  nextOpen,
}: {
  date: string;
  today: string;
  site: RestaurantPublic;
  closure: Closure | null;
  nextOpen: string | null;
}) {
  if (closure) {
    return (
      <div className="mx-4 flex flex-col items-center gap-3 rounded-[20px] border border-site-danger-line bg-site-danger-soft px-6 py-8 text-center lg:mx-0">
        <CalendarOff aria-hidden className="h-7 w-7 text-site-danger" />
        <p className="text-lg font-bold text-site-danger">
          {closure.reason ?? 'Fermeture exceptionnelle'}
        </p>
        <p className="text-sm text-site-subtle">Le restaurant est fermé {closureRange(closure)}.</p>
        {closure.description && (
          <p className="w-full whitespace-pre-line border-t border-site-danger-line pt-4 text-left text-sm">
            {closure.description}
          </p>
        )}
      </div>
    );
  }

  const closedDay = !isServed(date, site.service_days);
  const message = closedDay
    ? date === today
      ? "Le restaurant est fermé aujourd'hui."
      : 'Le restaurant est fermé ce jour-là.'
    : date < today
      ? "Aucun menu n'a été publié ce jour-là."
      : "Le menu de ce jour n'est pas encore publié.";

  const next = closedDay && nextOpen ? { day: nextOpen, label: dayLabel(nextOpen, today) } : null;

  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <p className="text-base font-semibold">{message}</p>
      {next && (
        <Link
          to={dayHref(next.day, today)}
          preventScrollReset
          className="text-sm font-semibold text-site-brand underline-offset-4 hover:underline"
        >
          Prochain service : {next.label.name.toLowerCase()} {next.label.date}
        </Link>
      )}
    </div>
  );
}

interface MenuBoardProps {
  org: string;
  site: RestaurantPublic;
  day: MenuData;
  today: string;
  strip: DayStrip;
  closure: Closure | null;
  nextOpen: string | null;
  todayEvent: News | null;
}

export function MenuBoard({
  org,
  site,
  day,
  today,
  strip,
  closure,
  nextOpen,
  todayEvent,
}: MenuBoardProps) {
  const [selectedItem, setSelectedItem] = useState<MenuItemData | null>(null);
  const menu = day.menu;
  const isToday = day.date === today;

  return (
    <section
      aria-labelledby="menu-title"
      className="border-b border-site-line lg:rounded-3xl lg:border lg:bg-site-surface lg:p-6"
    >
      <div className="lg:mb-6 lg:flex lg:flex-wrap lg:items-center lg:justify-between lg:gap-4">
        <h2
          id="menu-title"
          className="sr-only lg:not-sr-only lg:text-2xl lg:font-bold lg:tracking-tight"
        >
          Menu du {longDay(day.date)}
        </h2>
        <DayNav strip={strip} today={today} selected={day.date} />
      </div>

      {menu?.chef_note && (
        <div className="lg:mb-6">
          <ChefNote note={menu.chef_note} />
        </div>
      )}

      {isToday && todayEvent && (
        <div className="px-4 pt-4 lg:mb-6 lg:px-0 lg:pt-0">
          <TodayEvent item={todayEvent} today={today} />
        </div>
      )}

      {menu ? (
        <CategorySection
          categories={menu.by_category}
          onItemTap={setSelectedItem}
          substitutions={menu.substitutions}
        />
      ) : (
        <div className="py-4">
          <DayMessage
            date={day.date}
            today={today}
            site={site}
            closure={closure}
            nextOpen={nextOpen}
          />
        </div>
      )}

      {isToday && menu && (
        <VoteCard org={org} siteSlug={site.slug} iconPreset={site.vote_icon_preset} />
      )}

      <ItemDetailSheet
        item={selectedItem}
        open={selectedItem !== null}
        onClose={() => setSelectedItem(null)}
      />
    </section>
  );
}
