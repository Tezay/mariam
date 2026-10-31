import { formatShare, type QualityView } from './quality-view';

const CARD = 'flex flex-col rounded-[20px] border border-site-line bg-site-surface p-4 lg:p-5';
const FOOTNOTE = 'text-[13px] text-site-subtle';

function Purchases({ declaration }: { declaration: NonNullable<QualityView['declaration']> }) {
  return (
    <div className={`${CARD} gap-3.5`}>
      <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-site-subtle">
        {`Nos achats en ${declaration.year}`}
      </h3>
      <div className="grid grid-cols-2 gap-3">
        <p className="flex flex-col gap-0.5 rounded-2xl bg-site-brand-soft p-4">
          <span className="text-[28px] font-bold leading-tight text-site-brand lg:text-[30px]">
            {formatShare(declaration.sustainable_share)}
          </span>
          <span className="text-sm font-medium">de produits durables et de qualité</span>
        </p>
        <p className="flex flex-col gap-0.5 rounded-2xl bg-site-ok-soft p-4">
          <span className="text-[28px] font-bold leading-tight text-site-ok lg:text-[30px]">
            {formatShare(declaration.organic_share)}
          </span>
          <span className="text-sm font-medium">dont produits bio</span>
        </p>
      </div>
      {declaration.territorial_share != null && (
        <p className="flex items-baseline justify-between gap-3">
          <span className="font-bold">{formatShare(declaration.territorial_share)}</span>
          <span>De produits issus d'un projet alimentaire territorial</span>
        </p>
      )}
      <p className={FOOTNOTE}>
        Part en valeur des achats alimentaires de l'année, déclarée par le restaurant.
      </p>
    </div>
  );
}

function MenuShares({ lines }: { lines: QualityView['menuLines'] }) {
  return (
    <div className={`${CARD} gap-2.5`}>
      <h3 className="text-base font-bold">Dans nos menus, ces 30 derniers jours</h3>
      <dl className="flex flex-col gap-2.5">
        {lines.map(({ label, share }) => (
          <div key={label} className="flex justify-between gap-3">
            <dt>{label}</dt>
            <dd className="font-bold">{formatShare(share)}</dd>
          </div>
        ))}
      </dl>
      <p className={FOOTNOTE}>Calculé à partir des menus publiés par l'équipe.</p>
    </div>
  );
}

function Labels({ labels }: { labels: QualityView['labels'] }) {
  return (
    <div className={`${CARD} gap-3.5`}>
      <h3 className="text-base font-bold">Les labels que vous verrez ici</h3>
      <ul className="flex flex-col gap-3.5">
        {labels.map((label) => (
          <li key={label.id} className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-white p-1">
              <img src={`/certifications/${label.logo_filename}`} alt="" className="max-h-full" />
            </span>
            <div>
              <p className="font-semibold">{label.official_name}</p>
              <p className="text-sm text-site-subtle">
                {[label.guarantee, label.issuer].filter(Boolean).join('. ')}.
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function QualitySection({ view }: { view: QualityView }) {
  return (
    <section aria-labelledby="quality-title" className="flex flex-col gap-3 lg:gap-4">
      <h2 id="quality-title" className="text-lg font-bold lg:text-2xl lg:tracking-tight">
        Qualité des produits
      </h2>
      <div className="grid gap-3 lg:grid-cols-[repeat(auto-fill,minmax(300px,1fr))] lg:gap-4">
        {view.declaration && <Purchases declaration={view.declaration} />}
        {view.menuLines.length > 0 && <MenuShares lines={view.menuLines} />}
        {view.labels.length > 0 && <Labels labels={view.labels} />}
        {view.commitments && (
          <div className={`${CARD} gap-2`}>
            <h3 className="text-base font-bold">Nos engagements</h3>
            <p className="whitespace-pre-line text-site-subtle">{view.commitments}</p>
          </div>
        )}
      </div>
    </section>
  );
}
