import { cn } from '@/lib/utils';

const STEPS = [
  ['Demandez un devis', "Nous vous l'adressons par e-mail."],
  ['Envoyez le bon de commande', 'Ou le devis signé, selon votre organisme.'],
  ["La nouvelle période s'affiche ici", 'Le service continue sans interruption.'],
] as const;

export function RenewalSteps() {
  return (
    <ol className="mt-5 grid gap-2 sm:grid-cols-3 sm:gap-3">
      {STEPS.map(([title, detail], index) => (
        <li key={title} className="flex gap-3 rounded-xl bg-muted/60 p-3">
          <span
            className={cn(
              'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
              index === 0 ? 'bg-primary text-primary-foreground' : 'bg-primary/15 text-primary'
            )}
          >
            {index + 1}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
