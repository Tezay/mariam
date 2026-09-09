import type { RatingPreset, RatingValue } from './scale';

export function RatingIcons({
  preset,
  value,
  className,
}: {
  preset: RatingPreset;
  value: RatingValue;
  className?: string;
}) {
  const { Icon, count } = preset.icons[value];
  return (
    <span className="flex items-center justify-center gap-0.5">
      {Array.from({ length: count }, (_, index) => (
        <Icon key={index} className={className} />
      ))}
    </span>
  );
}
