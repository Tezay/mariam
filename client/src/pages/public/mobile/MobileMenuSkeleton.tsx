import { Skeleton } from '@/components/ui/skeleton';

/** Skeleton de chargement — simule le layout 2 colonnes */
export function MobileMenuSkeleton() {
    return (
        <div className="py-4 space-y-8">
            {[0, 1, 2].map(section => (
                <div key={section} className="px-4">
                    {/* Header de section */}
                    <div className="flex items-center gap-3 mb-3">
                        <div className="flex-1 h-px bg-gray-200" />
                        <Skeleton className="h-3 w-20" />
                        <div className="flex-1 h-px bg-gray-200" />
                    </div>
                    {/* Grille 2 colonnes */}
                    <div className="grid grid-cols-2 gap-3">
                        {[0, 1, 2, 3].map(card => (
                            <Skeleton key={card} className="aspect-[4/1] w-full rounded-2xl" />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
