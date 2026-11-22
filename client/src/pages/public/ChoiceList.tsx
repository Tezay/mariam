import { Link } from 'react-router';
import { ChevronRight, type LucideIcon } from 'lucide-react';

export interface Choice {
  to: string;
  name: string;
  logoUrl?: string | null;
}

interface ChoiceListProps {
  title: string;
  subtitle: string;
  choices: Choice[];
  icon: LucideIcon;
}

export function ChoiceList({ title, subtitle, choices, icon: Icon }: ChoiceListProps) {
  return (
    <div className="public-page flex min-h-screen flex-col items-center px-4 py-10">
      <div className="w-full max-w-2xl">
        <header className="mb-8 text-center">
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="mt-1 text-site-subtle">{subtitle}</p>
        </header>

        <ul className="space-y-3">
          {choices.map((choice) => (
            <li key={choice.to}>
              <Link
                to={choice.to}
                className="flex items-center gap-4 rounded-3xl border border-site-line bg-site-surface p-4 transition-colors hover:border-site-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-site-brand"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-site-brand-soft">
                  {choice.logoUrl ? (
                    <img
                      src={choice.logoUrl}
                      alt=""
                      className="h-full w-full bg-white object-contain p-1"
                    />
                  ) : (
                    <Icon className="h-6 w-6 text-site-brand" />
                  )}
                </div>
                <span className="flex-1 font-semibold">{choice.name}</span>
                <ChevronRight className="h-5 w-5 text-site-subtle" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
