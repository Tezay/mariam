import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface CountedFieldProps {
  id: string;
  label: string;
  help: string;
  value: string;
  max: number;
  onChange: (value: string) => void;
  rows?: number;
}

export function CountedField({ id, label, help, value, max, onChange, rows }: CountedFieldProps) {
  const control = {
    id,
    value,
    maxLength: max,
    'aria-describedby': `${id}-help`,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(event.target.value),
  };
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        <span className="text-xs tabular-nums text-muted-foreground">
          {value.length}/{max}
        </span>
      </div>
      {rows ? (
        <textarea
          rows={rows}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:text-sm"
          {...control}
        />
      ) : (
        <Input {...control} />
      )}
      <p id={`${id}-help`} className="text-xs text-muted-foreground">
        {help}
      </p>
    </div>
  );
}
