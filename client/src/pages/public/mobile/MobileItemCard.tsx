import { useState } from 'react';
import type { MenuItemData } from '../menu-types';
import type { CategoryColor } from '@/lib/category-colors';
import { Icon, type IconName } from '@/components/ui/icon-picker';

const TAG_ICON_COLOR: Record<string, { text: string; bg: string }> = {
    green:  { text: 'text-green-600',  bg: 'bg-green-50' },
    teal:   { text: 'text-teal-600',   bg: 'bg-teal-50' },
    orange: { text: 'text-orange-500', bg: 'bg-orange-50' },
    blue:   { text: 'text-blue-600',   bg: 'bg-blue-50' },
    indigo: { text: 'text-indigo-600', bg: 'bg-indigo-50' },
    amber:  { text: 'text-amber-500',  bg: 'bg-amber-50' },
    cyan:   { text: 'text-cyan-600',   bg: 'bg-cyan-50' },
    red:    { text: 'text-red-600',    bg: 'bg-red-50' },
    purple: { text: 'text-purple-600', bg: 'bg-purple-50' },
};

interface MobileItemCardProps {
    item: MenuItemData;
    categoryColor: CategoryColor;
    isHighlighted: boolean;
    imagePosition?: 'left' | 'right';
    onTap: () => void;
}

function StockBubble({ type }: { type: 'rupture' | 'nouveau' }) {
    const cls = type === 'rupture'
        ? 'bg-red-500 text-white'
        : 'bg-orange-400 text-white';
    return (
        <span className={`absolute top-0 left-3 -translate-y-1/2 z-30 ${cls} text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full whitespace-nowrap`}>
            {type === 'rupture' ? 'Rupture' : 'Nouveau'}
        </span>
    );
}

function BadgesBubble({ tags, certs }: {
    tags: NonNullable<MenuItemData['tags']>;
    certs: NonNullable<MenuItemData['certifications']>;
}) {
    const hasTags = tags.length > 0;
    const hasCerts = certs.length > 0;
    if (!hasTags && !hasCerts) return null;
    return (
        <div className="absolute bottom-0 right-2 translate-y-1/3 z-20 bg-white rounded-full border border-gray-200 shadow-sm flex items-center gap-1 px-1 py-1.5">
            {tags.slice(0, 4).map((tag) => {
                const colors = TAG_ICON_COLOR[tag.color] ?? { text: 'text-gray-500', bg: 'bg-gray-50' };
                return (
                    <span
                        key={tag.id}
                        title={tag.label}
                        className={`flex items-center justify-center w-4 h-4 rounded-full ${colors.bg}`}
                    >
                        <Icon name={tag.icon as IconName} className={`w-2.5 h-2.5 ${colors.text}`} />
                    </span>
                );
            })}
            {hasTags && hasCerts && (
                <span className="w-px h-3 bg-gray-200 mx-0.5 shrink-0" />
            )}
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

export function MobileItemCard({ item, categoryColor, isHighlighted, imagePosition = 'right', onTap }: MobileItemCardProps) {
    const [imgLoaded, setImgLoaded] = useState(false);

    const isOutOfStock = item.is_out_of_stock ?? false;
    const hasReplacement = isOutOfStock && !!item.replacement_label;
    const certs = item.certifications ?? [];
    const tags = item.tags ?? [];
    const firstImage = item.images?.[0]?.url;

    const displayName = hasReplacement ? item.replacement_label! : item.name;
    const isStrikethrough = isOutOfStock && !hasReplacement;

    if (isHighlighted) {
        const showImage = !!firstImage;

        return (
            <div className="relative">
                <button
                    type="button"
                    onClick={onTap}
                    className="w-full flex items-center active:scale-[0.98] transition-transform text-left"
                >
                    {/* Image gauche */}
                    {imagePosition === 'left' && showImage && (
                        <div className="w-28 h-28 rounded-2xl overflow-hidden shrink-0 relative z-10">
                            {!imgLoaded && (
                                <div className="absolute inset-0 rounded-2xl animate-pulse bg-gray-200" />
                            )}
                            <img
                                src={firstImage}
                                alt={item.name}
                                className={`w-full h-full object-cover transition-opacity duration-200 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
                                onLoad={() => setImgLoaded(true)}
                            />
                        </div>
                    )}

                    {/* Box texte */}
                    <div
                        className={`flex-1 px-4 py-4 rounded-2xl relative z-0 ${imagePosition === 'left' && showImage ? 'ml-[-12px]' : ''} ${imagePosition === 'right' && showImage ? 'mr-[-12px]' : ''}`}
                        style={{
                            backgroundColor: categoryColor.bg,
                            borderBottom: `4px solid ${categoryColor.border}`,
                        }}
                    >
                        {isOutOfStock && (
                            <StockBubble type={hasReplacement ? 'nouveau' : 'rupture'} />
                        )}
                        <p
                            className={`text-base font-bold line-clamp-2 leading-snug ${isStrikethrough ? 'line-through opacity-60' : ''}`}
                            style={{ color: categoryColor.label }}
                        >
                            {displayName}
                        </p>
                        {/* Bulles tags (gauche) et certifications (droite) */}
                        <BadgesBubble tags={tags} certs={certs} />
                    </div>

                    {/* Image droite */}
                    {imagePosition === 'right' && showImage && (
                        <div className="w-28 h-28 rounded-2xl overflow-hidden shrink-0 relative z-10">
                            {!imgLoaded && (
                                <div className="absolute inset-0 rounded-2xl animate-pulse bg-gray-200" />
                            )}
                            <img
                                src={firstImage}
                                alt={item.name}
                                className={`w-full h-full object-cover transition-opacity duration-200 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
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
                className="w-full rounded-2xl flex items-center px-3 active:scale-[0.97] transition-transform text-left min-h-[52px]"
                style={{
                    backgroundColor: categoryColor.bg,
                    borderBottom: `4px solid ${categoryColor.border}`,
                    paddingTop: '10px',
                    paddingBottom: '10px',
                }}
            >
                {isOutOfStock && (
                    <StockBubble type={hasReplacement ? 'nouveau' : 'rupture'} />
                )}
                <p
                    className={`text-sm font-bold line-clamp-1 leading-tight w-full ${isStrikethrough ? 'line-through opacity-60' : ''}`}
                    style={{ color: categoryColor.label }}
                >
                    {displayName}
                </p>
            </button>

            {/* Bulles tags (gauche) et certifications (droite) */}
            <BadgesBubble tags={tags} certs={certs} />
        </div>
    );
}
