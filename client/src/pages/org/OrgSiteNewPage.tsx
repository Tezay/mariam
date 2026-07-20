/**
 * Dedicated page to create a new site of the organization.
 */
import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { restaurantApi, getApiErrorMessage } from '@/lib/api';
import { notify } from '@/lib/toast';
import { PageHeader, PrimaryButton, Field, inputClass } from './ui';

export function OrgSiteNewPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', code: '', slug: '' });
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.code.trim()) {
      notify.error('Nom et code requis');
      return;
    }
    setSaving(true);
    try {
      const site = await restaurantApi.create({
        name: form.name.trim(),
        code: form.code.trim(),
        slug: form.slug.trim() || undefined,
      });
      notify.success('Site créé');
      navigate(`/org/sites/${site.id}`);
    } catch (err) {
      notify.error(getApiErrorMessage(err, 'Création impossible'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg">
      <Link
        to="/org/sites"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Sites
      </Link>

      <PageHeader title="Nouveau site" description="Ajoutez un restaurant à votre organisation" />

      <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-card p-5">
        <Field label="Nom" hint="Nom affiché du restaurant.">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Restaurant Universitaire EFREI"
            className={inputClass}
            autoFocus
          />
        </Field>
        <Field label="Code" hint="Identifiant interne unique (ex. EFREI).">
          <input
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            placeholder="EFREI"
            className={inputClass}
          />
        </Field>
        <Field
          label="Slug URL"
          hint="Optionnel — dérivé du code sinon. Apparaît dans l’URL publique du menu."
        >
          <input
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            placeholder="efrei"
            className={inputClass}
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Link to="/org/sites">
            <button
              type="button"
              className="rounded-lg px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
            >
              Annuler
            </button>
          </Link>
          <PrimaryButton type="submit" disabled={saving}>
            Créer le site
          </PrimaryButton>
        </div>
      </form>
    </div>
  );
}
