import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { MenuItemData } from '../menu-types';
import type { DietaryTag, CertificationItem } from '@/lib/api';

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
        <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium ${TAG_COLOR_CLASSES[tag.color] || 'bg-gray-100 text-gray-700'}`}>
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
                className="h-10 w-10 object-contain shrink-0"
            />
            <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{cert.name}</p>
                {cert.official_name && cert.official_name !== cert.name && (
                    <p className="text-xs text-gray-500 mt-0.5">{cert.official_name}</p>
                )}
                {cert.guarantee && (
                    <p className="text-xs text-gray-500 mt-1 leading-snug">{cert.guarantee}</p>
                )}
                <div className="flex flex-wrap gap-x-2 text-xs text-gray-400 mt-1">
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
    const [imgIndex, setImgIndex] = useState(0);

    const images = item?.images ?? [];
    const tags = item?.tags ?? [];
    const certs = item?.certifications ?? [];
    const isOutOfStock = item?.is_out_of_stock ?? false;

    // Grouper les tags par category_id
    const tagsByCategory: Record<string, DietaryTag[]> = {};
    tags.forEach(tag => {
        if (!tagsByCategory[tag.category_id]) tagsByCategory[tag.category_id] = [];
        tagsByCategory[tag.category_id].push(tag);
    });

    return (
        <Sheet open={open} onOpenChange={open => { if (!open) onClose(); }}>
            <SheetContent
                side="bottom"
                className="h-[90vh] overflow-y-auto p-0 rounded-t-2xl flex flex-col"
            >
                {/* Drag handle */}
                <div className="flex justify-center pt-3 pb-1 shrink-0">
                    <div className="w-12 h-1 bg-gray-200 rounded-full" />
                </div>

                {item && (
                    <>
                        <SheetHeader className="px-5 pt-2 pb-3 shrink-0">
                            <SheetTitle className="text-xl font-bold text-left leading-snug">
                                {item.replacement_label ?? item.name}
                            </SheetTitle>

                            {/* Contexte rupture */}
                            {isOutOfStock && !item.replacement_label && (
                                <p className="text-sm text-red-600 mt-1">Cet article est actuellement en rupture de service.</p>
                            )}
                            {isOutOfStock && item.replacement_label && (
                                <p className="text-sm text-amber-600 mt-1">Remplace : {item.name}</p>
                            )}
                        </SheetHeader>

                        <div className="flex-1 overflow-y-auto px-5 pb-8 space-y-5">
                            {/* Galerie images */}
                            {images.length > 0 && (
                                <div className="relative rounded-2xl overflow-hidden bg-gray-100">
                                    <div className="aspect-[4/3] w-full">
                                        <img
                                            src={images[imgIndex].url}
                                            alt={item.name}
                                            className="w-full h-full object-cover"
                                        />
                                    </div>
                                    {images.length > 1 && (
                                        <>
                                            <button
                                                onClick={() => setImgIndex(prev => (prev - 1 + images.length) % images.length)}
                                                className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 text-white p-1.5 rounded-full"
                                            >
                                                <ChevronLeft className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => setImgIndex(prev => (prev + 1) % images.length)}
                                                className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 text-white p-1.5 rounded-full"
                                            >
                                                <ChevronRight className="w-4 h-4" />
                                            </button>
                                            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                                                {images.map((_, i) => (
                                                    <button
                                                        key={i}
                                                        onClick={() => setImgIndex(i)}
                                                        className={`w-2 h-2 rounded-full transition-all ${i === imgIndex ? 'bg-white scale-125' : 'bg-white/50'}`}
                                                    />
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Tags alimentaires groupés */}
                            {Object.entries(tagsByCategory).length > 0 && (
                                <div className="space-y-3">
                                    {Object.entries(tagsByCategory).map(([categoryId, groupTags]) => (
                                        <div key={categoryId}>
                                            {TAG_CATEGORY_NAMES[categoryId] && (
                                                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                                                    {TAG_CATEGORY_NAMES[categoryId]}
                                                </p>
                                            )}
                                            <div className="flex flex-wrap gap-2">
                                                {groupTags.map(tag => <TagChip key={tag.id} tag={tag} />)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Certifications */}
                            {certs.length > 0 && (
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                                        Certifications
                                    </p>
                                    <div className="divide-y divide-gray-100">
                                        {certs.map(cert => <CertRow key={cert.id} cert={cert} />)}
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </SheetContent>
        </Sheet>
    );
}
