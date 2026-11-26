import { supportEmail } from '@/lib/runtime-config.server';
import { PrivacyPage } from './PrivacyPage';
import type { Route } from './+types/privacy-route';

export function loader() {
  return { supportEmail: supportEmail() };
}

export const meta: Route.MetaFunction = () => [
  { title: 'Confidentialité — Mariam' },
  {
    name: 'description',
    content:
      'Ce que Mariam mesure quand vous consultez ou notez un menu, combien de temps, et vos droits.',
  },
];

export default function PrivacyRoute({ loaderData }: Route.ComponentProps) {
  return <PrivacyPage supportEmail={loaderData.supportEmail} />;
}
