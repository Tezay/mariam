import { MessageSquare, Star, UtensilsCrossed } from 'lucide-react';
import { formatNumber, formatScore } from '@/features/analytics/format';

export interface DishMetric {
  icon: typeof Star;
  label: string;
  value: string;
}

export function metricsOf(row: {
  usageCount: number;
  votes: number;
  score: number | null;
}): DishMetric[] {
  return [
    { icon: UtensilsCrossed, label: 'Passages au menu', value: formatNumber(row.usageCount) },
    { icon: MessageSquare, label: 'Avis reçus', value: formatNumber(row.votes) },
    { icon: Star, label: 'Note moyenne sur 3', value: formatScore(row.score) },
  ];
}
