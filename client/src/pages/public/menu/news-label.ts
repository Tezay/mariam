import type { News } from '@/lib/api/news';

function dayLabel(date: string): string {
  const label = new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function newsLabel(item: News, today: string): string {
  let when = '';
  if (item.date) {
    when = item.date === today ? "Aujourd'hui" : dayLabel(item.date);
  } else if (item.published_at) {
    const day = new Date(item.published_at).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      timeZone: 'Europe/Paris',
    });
    when = `Publiée le ${day}`;
  }
  return [item.pinned && 'À la une', when].filter(Boolean).join(' · ');
}
