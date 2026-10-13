import {
  BadgeCheck,
  Ban,
  Candy,
  ChefHat,
  Droplets,
  Fish,
  Flame,
  Leaf,
  MapPin,
  MilkOff,
  NotebookPen,
  NutOff,
  Soup,
  Sparkles,
  Sprout,
  Tag,
  TreePine,
  WheatOff,
  WineOff,
} from 'lucide-react';
import type { LucideIcon, LucideProps } from 'lucide-react';

// The icons of server/app/data/taxonomy.py, listed rather than loaded by name:
// lucide-react/dynamic makes the build emit one file per icon of the library.
const ICONS: Record<string, LucideIcon> = {
  'badge-check': BadgeCheck,
  ban: Ban,
  candy: Candy,
  'chef-hat': ChefHat,
  droplets: Droplets,
  fish: Fish,
  flame: Flame,
  leaf: Leaf,
  'map-pin': MapPin,
  'milk-off': MilkOff,
  'notebook-pen': NotebookPen,
  'nut-off': NutOff,
  soup: Soup,
  sparkles: Sparkles,
  sprout: Sprout,
  'tree-pine': TreePine,
  'wheat-off': WheatOff,
  'wine-off': WineOff,
};

export function TagIcon({ name, ...props }: LucideProps & { name: string }) {
  const Icon = ICONS[name] ?? Tag;
  return <Icon {...props} />;
}
