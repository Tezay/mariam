import { useState } from 'react';
import type { MenuItemData } from '../menu-types';
import type { CategoryColor } from '@/lib/category-colors';

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

function CertsBubble({ certs }: { certs: NonNullable<MenuItemData['certifications']> }) {
    if (certs.length === 0) return null;
    return (
        <div className="absolute bottom-0 right-2 translate-y-1/2 z-20 bg-white rounded-full border border-gray-200 shadow-sm flex items-center gap-1.5 px-1.5 py-1">
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
                        className={`flex-1 px-4 py-4 rounded-2xl bg-white shadow-sm relative z-0 ${imagePosition === 'left' && showImage ? 'ml-[-12px]' : ''} ${imagePosition === 'right' && showImage ? 'mr-[-12px]' : ''}`}
                    >
                        {isOutOfStock && (
                            <StockBubble type={hasReplacement ? 'nouveau' : 'rupture'} />
                        )}
                        <p className={`text-base font-bold line-clamp-2 leading-snug ${isStrikethrough ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                            {displayName}
                        </p>
                        {/* Bulle certifications dans la text box */}
                        <CertsBubble certs={certs} />
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

            {/* Bulle certifications en bas-droit du bouton */}
            <CertsBubble certs={certs} />
        </div>
    );
}
