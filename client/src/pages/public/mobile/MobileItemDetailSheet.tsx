import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import type { MenuItemData } from '../menu-types';
import type { DietaryTag, CertificationItem } from '@/lib/api';
import { DynamicIcon as Icon } from 'lucide-react/dynamic';
import type { IconName } from 'lucide-react/dynamic';

const TAG_COLOR_CLASSES: Record<string, string> = {
  green: 'bg-green-100 text-green-700 border-green-200',
  teal: 'bg-teal-100 text-teal-700 border-teal-200',
  orange: 'bg-orange-100 text-orange-700 border-orange-200',
  blue: 'bg-blue-100 text-blue-700 border-blue-200',
  indigo: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  amber: 'bg-amber-100 text-amber-700 border-amber-200',
  cyan: 'bg-cyan-100 text-cyan-700 border-cyan-200',
};

const TAG_CATEGORY_NAMES: Record<string, string> = {
  regime: 'Régime alimentaire',
  allergenes: 'Allergènes',
  preparation: 'Mode de préparation',
  gout: 'Goût',
};

const JURISDICTION_LABELS: Record<string, string> = {
  france: '🇫🇷 France',
  eu: '🇪🇺 Union européenne',
  international: '🌍 International',
};

const SCHEME_LABELS: Record<string, string> = {
  public: 'Label officiel',
  private: 'Label privé',
};

function TagChip({ tag }: { tag: DietaryTag }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${TAG_COLOR_CLASSES[tag.color] || 'bg-gray-100 text-gray-700'}`}
    >
      <Icon name={tag.icon as IconName} className="h-3 w-3 shrink-0" />
      {tag.label}
    </span>
  );
}

function CertRow({ cert }: { cert: CertificationItem }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <img
        src={`/certifications/${cert.logo_filename}`}
        alt={cert.name}
        className="h-10 w-10 shrink-0 object-contain"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{cert.name}</p>
        {cert.official_name && cert.official_name !== cert.name && (
          <p className="mt-0.5 text-xs text-gray-500">{cert.official_name}</p>
        )}
        {cert.guarantee && (
          <p className="mt-1 text-xs leading-snug text-gray-500">{cert.guarantee}</p>
        )}
        <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-gray-400">
          {cert.issuer && <span>{cert.issuer}</span>}
          <span>{JURISDICTION_LABELS[cert.jurisdiction]}</span>
          <span>{SCHEME_LABELS[cert.scheme_type]}</span>
        </div>
      </div>
    </div>
  );
}

interface MobileItemDetailSheetProps {
  item: MenuItemData | null;
  open: boolean;
  onClose: () => void;
}

export function MobileItemDetailSheet({ item, open, onClose }: MobileItemDetailSheetProps) {
  const dishName = item?.dish?.name ?? '';
  const dishImage = item?.dish?.image_url ?? null;
  const tags = item?.dish?.tags ?? [];
  const certs = item?.dish?.certifications ?? [];
  const isOutOfStock = item?.is_out_of_stock ?? false;

  const tagsByCategory: Record<string, DietaryTag[]> = {};
  tags.forEach((tag) => {
    if (!tagsByCategory[tag.category_id]) tagsByCategory[tag.category_id] = [];
    tagsByCategory[tag.category_id].push(tag);
  });

  return (
    <Drawer
      open={open}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DrawerContent className="flex h-[70vh] flex-col p-0">
        {item && (
          <>
            <DrawerHeader className="shrink-0 px-5 pb-3 pt-2">
              <DrawerTitle className="pr-8 text-left text-xl font-bold leading-snug">
                {dishName}
              </DrawerTitle>
              {isOutOfStock && (
                <p className="mt-1 text-sm text-red-600">
                  Cet article est actuellement en rupture de service.
                </p>
              )}
            </DrawerHeader>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 pb-8">
              {/* Image du plat */}
              {dishImage && (
                <div className="overflow-hidden rounded-2xl bg-gray-100">
                  <div className="aspect-[4/3] w-full">
                    <img src={dishImage} alt={dishName} className="h-full w-full object-cover" />
                  </div>
                </div>
              )}

              {/* Tags alimentaires groupés */}
              {Object.entries(tagsByCategory).length > 0 && (
                <div className="space-y-3">
                  {Object.entries(tagsByCategory).map(([categoryId, groupTags]) => (
                    <div key={categoryId}>
                      {TAG_CATEGORY_NAMES[categoryId] && (
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
                          {TAG_CATEGORY_NAMES[categoryId]}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {groupTags.map((tag) => (
                          <TagChip key={tag.id} tag={tag} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Certifications */}
              {certs.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Certifications
                  </p>
                  <div className="divide-y divide-gray-100">
                    {certs.map((cert) => (
                      <CertRow key={cert.id} cert={cert} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}
