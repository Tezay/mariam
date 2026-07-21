import { useState } from 'react';
import type { MenuItemData } from '../menu-types';
import type { CategoryColor } from '@/lib/category-colors';
import { DynamicIcon as Icon } from 'lucide-react/dynamic';
import type { IconName } from 'lucide-react/dynamic';

const TAG_ICON_COLOR: Record<string, { text: string; bg: string }> = {
  green: { text: 'text-green-600', bg: 'bg-green-50' },
  teal: { text: 'text-teal-600', bg: 'bg-teal-50' },
  orange: { text: 'text-orange-500', bg: 'bg-orange-50' },
  blue: { text: 'text-blue-600', bg: 'bg-blue-50' },
  indigo: { text: 'text-indigo-600', bg: 'bg-indigo-50' },
  amber: { text: 'text-amber-500', bg: 'bg-amber-50' },
  cyan: { text: 'text-cyan-600', bg: 'bg-cyan-50' },
  red: { text: 'text-red-600', bg: 'bg-red-50' },
  purple: { text: 'text-purple-600', bg: 'bg-purple-50' },
};

interface MobileItemCardProps {
  item: MenuItemData;
  categoryColor: CategoryColor;
  isHighlighted: boolean;
  imagePosition?: 'left' | 'right';
  isNew?: boolean;
  onTap: () => void;
}

function StockBubble() {
  return (
    <span className="absolute left-3 top-0 z-30 -translate-y-1/2 whitespace-nowrap rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
      Rupture
    </span>
  );
}

function NewBubble() {
  return (
    <span className="absolute left-3 top-0 z-30 -translate-y-1/2 whitespace-nowrap rounded-full bg-[#F5A524] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#4A2E00]">
      Nouveau
    </span>
  );
}

function BadgesBubble({
  tags,
  certs,
}: {
  tags: NonNullable<MenuItemData['dish']>['tags'];
  certs: NonNullable<MenuItemData['dish']>['certifications'];
}) {
  const hasTags = tags.length > 0;
  const hasCerts = certs.length > 0;
  if (!hasTags && !hasCerts) return null;
  return (
    <div className="absolute bottom-0 right-2 z-20 flex translate-y-1/3 items-center gap-1 rounded-full border border-gray-200 bg-white px-1 py-1.5 shadow-sm">
      {tags.slice(0, 4).map((tag) => {
        const colors = TAG_ICON_COLOR[tag.color] ?? {
          text: 'text-gray-500',
          bg: 'bg-gray-50',
        };
        return (
          <span
            key={tag.id}
            title={tag.label}
            className={`flex h-4 w-4 items-center justify-center rounded-full ${colors.bg}`}
          >
            <Icon name={tag.icon as IconName} className={`h-2.5 w-2.5 ${colors.text}`} />
          </span>
        );
      })}
      {hasTags && hasCerts && <span className="mx-0.5 h-3 w-px shrink-0 bg-gray-200" />}
      {certs.slice(0, 3).map((cert) => (
        <img
          key={cert.id}
          src={`/certifications/${cert.logo_filename}`}
          alt={cert.name}
          title={cert.name}
          className="h-4 w-4 object-contain"
        />
      ))}
    </div>
  );
}

export function MobileItemCard({
  item,
  categoryColor,
  isHighlighted,
  imagePosition = 'right',
  isNew = false,
  onTap,
}: MobileItemCardProps) {
  const [imgLoaded, setImgLoaded] = useState(false);

  const isOutOfStock = item.is_out_of_stock ?? false;
  const dishName = item.dish?.name ?? '';
  const certs = item.dish?.certifications ?? [];
  const tags = item.dish?.tags ?? [];
  const dishImage = item.dish?.image_url ?? undefined;

  if (isHighlighted) {
    const showImage = !!dishImage;

    return (
      <div className="relative">
        <button
          type="button"
          onClick={onTap}
          className="flex w-full items-center text-left transition-transform active:scale-[0.98]"
        >
          {/* Image gauche */}
          {imagePosition === 'left' && showImage && (
            <div className="relative z-10 h-28 w-28 shrink-0 overflow-hidden rounded-2xl">
              {!imgLoaded && (
                <div className="absolute inset-0 animate-pulse rounded-2xl bg-gray-200" />
              )}
              <img
                src={dishImage}
                alt={dishName}
                loading="lazy"
                className={`h-full w-full object-cover transition-opacity duration-200 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
                onLoad={() => setImgLoaded(true)}
              />
            </div>
          )}

          {/* Box texte */}
          <div
            className={`relative z-0 flex-1 rounded-2xl px-4 py-4 ${imagePosition === 'left' && showImage ? 'ml-[-12px]' : ''} ${imagePosition === 'right' && showImage ? 'mr-[-12px]' : ''}`}
            style={{
              backgroundColor: categoryColor.bg,
              borderBottom: `4px solid ${categoryColor.border}`,
            }}
          >
            {isOutOfStock && <StockBubble />}
            {isNew && <NewBubble />}
            <p
              className={`line-clamp-2 text-base font-bold leading-snug ${isOutOfStock ? 'line-through opacity-60' : ''}`}
              style={{ color: categoryColor.label }}
            >
              {dishName}
            </p>
            <BadgesBubble tags={tags} certs={certs} />
          </div>

          {/* Image droite */}
          {imagePosition === 'right' && showImage && (
            <div className="relative z-10 h-28 w-28 shrink-0 overflow-hidden rounded-2xl">
              {!imgLoaded && (
                <div className="absolute inset-0 animate-pulse rounded-2xl bg-gray-200" />
              )}
              <img
                src={dishImage}
                alt={dishName}
                loading="lazy"
                className={`h-full w-full object-cover transition-opacity duration-200 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
                onLoad={() => setImgLoaded(true)}
              />
            </div>
          )}
        </button>
      </div>
    );
  }

  // Mode standard (grille 2 colonnes)
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onTap}
        className="flex min-h-[52px] w-full items-center rounded-2xl px-3 text-left transition-transform active:scale-[0.97]"
        style={{
          backgroundColor: categoryColor.bg,
          borderBottom: `4px solid ${categoryColor.border}`,
          paddingTop: '10px',
          paddingBottom: '10px',
        }}
      >
        {isOutOfStock && <StockBubble />}
        {isNew && <NewBubble />}
        <p
          className={`line-clamp-1 w-full text-sm font-bold leading-tight ${isOutOfStock ? 'line-through opacity-60' : ''}`}
          style={{ color: categoryColor.label }}
        >
          {dishName}
        </p>
      </button>

      <BadgesBubble tags={tags} certs={certs} />
    </div>
  );
}
