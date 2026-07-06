/**
 * Photo du plat (facultative, mise en avant) : le plat existe déjà au
 * catalogue, l'upload est direct. Toujours skipable, modifiable plus tard
 * depuis la page Catalogue.
 */
import { useState, useRef } from 'react';
import { Camera, Check, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { notify } from '@/lib/toast';
import { cn } from '@/lib/utils';
import type { UseOnboardingStateReturn } from '../useOnboardingState';

const ACCEPTED = 'image/jpeg,image/png,image/webp,image/heic,image/heif';
const MAX_SIZE_MB = 5;

export function PhotoStep({ state }: { state: UseOnboardingStateReturn }) {
    const { activeDish } = state;
    const [isUploading, setIsUploading] = useState(false);
    const [failed, setFailed] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    if (!activeDish) return null;
    const hasPhoto = !!activeDish.image_url;

    const handleFile = async (file: File | undefined) => {
        if (!file) return;
        if (file.size > MAX_SIZE_MB * 1024 * 1024) {
            notify.error(`Image trop lourde (max ${MAX_SIZE_MB} Mo)`);
            return;
        }
        setIsUploading(true);
        setFailed(false);
        try {
            await state.uploadDishPhoto(file);
        } catch {
            setFailed(true);
            notify.error("L'upload a échoué. Vous pourrez réessayer plus tard.");
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-4 space-y-4">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Photo du plat</p>
                    <h2 className="text-lg font-semibold text-foreground mt-0.5 break-words">
                        Une photo pour « {activeDish.name} » ?
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        Les plats en photo sont mis en avant sur l'affichage public et aident
                        les étudiants à se décider. Facultatif, modifiable à tout moment depuis le Catalogue.
                    </p>
                </div>

                <input
                    ref={inputRef}
                    type="file"
                    accept={ACCEPTED}
                    className="hidden"
                    onChange={e => { handleFile(e.target.files?.[0]); e.target.value = ''; }}
                />

                {hasPhoto ? (
                    <div className="flex flex-col items-center gap-3">
                        <div className="relative w-40 h-40 rounded-2xl overflow-hidden border border-border">
                            <img src={activeDish.image_url!} alt={activeDish.name} className="w-full h-full object-cover" />
                            <span className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                                <Check className="w-3.5 h-3.5" />
                            </span>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => inputRef.current?.click()} disabled={isUploading} className="gap-1.5 rounded-xl text-muted-foreground">
                            <RefreshCw className="w-3.5 h-3.5" />
                            Changer la photo
                        </Button>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => inputRef.current?.click()}
                        disabled={isUploading}
                        className={cn(
                            'w-full rounded-2xl border-2 border-dashed p-8 text-center transition-colors',
                            'border-primary/40 bg-primary/5 hover:border-primary hover:bg-primary/10',
                            isUploading && 'opacity-60 pointer-events-none',
                        )}
                    >
                        {isUploading ? (
                            <Loader2 className="w-8 h-8 mx-auto mb-2 text-primary animate-spin" />
                        ) : (
                            <Camera className="w-8 h-8 mx-auto mb-2 text-primary" />
                        )}
                        <p className="text-sm font-medium text-foreground">
                            {isUploading ? 'Envoi en cours…' : failed ? 'Réessayer' : 'Prendre ou choisir une photo'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">JPEG, PNG, WebP ou HEIC · {MAX_SIZE_MB} Mo max</p>
                    </button>
                )}
            </div>

            <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-t border-border bg-background pb-[max(env(safe-area-inset-bottom),0.75rem)]">
                <div className="flex-1" />
                {hasPhoto ? (
                    <Button onClick={state.skipPhoto} className="rounded-xl h-12 sm:h-10">Continuer</Button>
                ) : (
                    <Button variant="ghost" onClick={state.skipPhoto} disabled={isUploading} className="rounded-xl text-muted-foreground h-12 sm:h-10">
                        Passer
                    </Button>
                )}
            </div>
        </div>
    );
}
