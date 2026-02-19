/**
 * MARIAM - Éditeur d'événement (Drawer latéral responsive)
 *
 * Permet de créer ou modifier un événement :
 * - Titre, sous-titre, description Markdown
 * - Date, couleur symbolique, visibilité, statut
 * - Upload d'images (1-6) via S3
 */
import { useState } from 'react';
import { eventsApi, Event, EventImage } from '@/lib/api';
import { EVENT_PRESET_COLORS, generateEventPalette } from '@/lib/color-utils';
import { ImageUploader } from '@/components/ImageUploader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Save,
    Send,
    Eye,
    EyeOff,
    Palette,
    Calendar,
    Type,
    AlignLeft,
    Image as ImageIcon,
    Loader2,
    X,
} from 'lucide-react';

interface EventEditorProps {
    event: Event | null;
    onClose: () => void;
    onSave: () => void;
    storageConfigured: boolean;
}

export function EventEditor({ event, onClose, onSave, storageConfigured }: EventEditorProps) {
    const isEditing = !!event;

    // Champs du formulaire
    const [title, setTitle] = useState(event?.title || '');
    const [subtitle, setSubtitle] = useState(event?.subtitle || '');
    const [description, setDescription] = useState(event?.description || '');
    const [eventDate, setEventDate] = useState(event?.event_date || '');
    const [color, setColor] = useState(event?.color || '#3498DB');
    const [visibility, setVisibility] = useState<'tv' | 'mobile' | 'all'>(event?.visibility || 'all');
    const [customColor, setCustomColor] = useState('');
    const [showDescPreview, setShowDescPreview] = useState(false);

    // Images
    const [serverImages, setServerImages] = useState<EventImage[]>(event?.images || []);
    const [pendingFiles, setPendingFiles] = useState<File[]>([]);
    const [deletedImageIds, setDeletedImageIds] = useState<number[]>([]);

    // État
    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const palette = generateEventPalette(color);

    // ------------------------------------------------------------------
    // Enregistrement
    // ------------------------------------------------------------------

    const handleSave = async (publish = false) => {
        if (!title.trim()) {
            setError('Le titre est requis');
            return;
        }
        if (!eventDate) {
            setError('La date est requise');
            return;
        }

        setError(null);
        setIsSaving(true);

        try {
            let savedEvent: Event;

            const payload = {
                title: title.trim(),
                subtitle: subtitle.trim() || undefined,
                description: description.trim() || undefined,
                event_date: eventDate,
                color,
                visibility,
                status: publish ? 'published' : (event?.status || 'draft'),
            };

            if (isEditing) {
                savedEvent = await eventsApi.update(event.id, payload);
            } else {
                savedEvent = await eventsApi.create(payload);
            }

            // Upload des nouvelles images
            if (pendingFiles.length > 0 && storageConfigured) {
                setIsUploading(true);
                for (const file of pendingFiles) {
                    try {
                        await eventsApi.uploadImage(savedEvent.id, file);
                    } catch (err) {
                        console.error('Erreur upload image:', err);
                    }
                }
                setIsUploading(false);
            }

            // Supprimer les images retirées
            for (const imgId of deletedImageIds) {
                try {
                    await eventsApi.deleteImage(savedEvent.id, imgId);
                } catch (err) {
                    console.error('Erreur suppression image:', err);
                }
            }

            // Publier si demandé
            if (publish && savedEvent.status !== 'published') {
                await eventsApi.publish(savedEvent.id);
            }

            onSave();
        } catch (err: any) {
            const msg = err?.response?.data?.error || "Erreur lors de l'enregistrement";
            setError(msg);
        } finally {
            setIsSaving(false);
            setIsUploading(false);
        }
    };

    // ------------------------------------------------------------------
    // Handlers images
    // ------------------------------------------------------------------

    const handleFilesAdded = (files: File[]) => {
        setPendingFiles(prev => [...prev, ...files]);
    };

    const handlePendingRemove = (index: number) => {
        setPendingFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleServerRemove = (imageId: number) => {
        setServerImages(prev => prev.filter(img => img.id !== imageId));
        setDeletedImageIds(prev => [...prev, imageId]);
    };

    const handleReorder = async (imageIds: number[]) => {
        const reordered = imageIds
            .map(id => serverImages.find(img => img.id === id))
            .filter(Boolean) as EventImage[];
        setServerImages(reordered);

        if (isEditing && event) {
            try {
                await eventsApi.reorderImages(event.id, imageIds);
            } catch (err) {
                console.error('Erreur réordonnancement:', err);
            }
        }
    };

    // ------------------------------------------------------------------
    // Rendu simple du Markdown (basique)
    // ------------------------------------------------------------------

    const renderMarkdownPreview = (md: string) => {
        let html = md
            // Headers
            .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-3 mb-1">$1</h3>')
            .replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold mt-4 mb-1">$1</h2>')
            .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-4 mb-2">$1</h1>')
            // Bold & italic
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            // Links
            .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" class="text-blue-600 underline" target="_blank" rel="noopener">$1</a>')
            // Lists
            .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
            // Paragraphs
            .replace(/\n\n/g, '</p><p class="mt-2">')
            .replace(/\n/g, '<br/>');

        return `<p class="mt-2">${html}</p>`;
    };

    // ------------------------------------------------------------------
    // Rendu
    // ------------------------------------------------------------------

    return (
        <>
            {/* Overlay */}
            <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

            {/* Drawer */}
            <div className="fixed right-0 top-0 h-full w-full max-w-2xl bg-card border-l border-border shadow-xl z-50 overflow-y-auto">
                {/* Header sticky */}
                <div className="sticky top-0 bg-card border-b border-border px-4 sm:px-6 py-4 flex items-center justify-between z-10">
                    <div className="flex items-center gap-2 min-w-0">
                        <div
                            className="w-4 h-4 rounded-full border shrink-0"
                            style={{ backgroundColor: color }}
                        />
                        <h2 className="text-lg font-semibold text-foreground truncate">
                            {isEditing ? 'Modifier l\'événement' : 'Nouvel événement'}
                        </h2>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-muted rounded-full text-muted-foreground hover:text-foreground shrink-0">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Contenu */}
                <div className="p-4 sm:p-6 space-y-6">
                    {/* Erreur */}
                    {error && (
                        <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
                            {error}
                        </div>
                    )}

                    {/* Titre */}
                    <div className="space-y-2">
                        <Label htmlFor="event-title" className="flex items-center gap-2">
                            <Type className="w-4 h-4" /> Titre principal
                        </Label>
                        <Input
                            id="event-title"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            placeholder="Ex: Semaine Asiatique"
                            maxLength={100}
                        />
                    </div>

                    {/* Sous-titre */}
                    <div className="space-y-2">
                        <Label htmlFor="event-subtitle">Sous-titre</Label>
                        <Input
                            id="event-subtitle"
                            value={subtitle}
                            onChange={e => setSubtitle(e.target.value)}
                            placeholder="Ex: Découvrez les saveurs d'Asie"
                            maxLength={200}
                        />
                    </div>

                    {/* Date & Couleur */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="event-date" className="flex items-center gap-2">
                                <Calendar className="w-4 h-4" /> Date
                            </Label>
                            <Input
                                id="event-date"
                                type="date"
                                value={eventDate}
                                onChange={e => setEventDate(e.target.value)}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                                <Palette className="w-4 h-4" /> Couleur
                            </Label>
                            <div className="flex flex-wrap gap-1.5">
                                {EVENT_PRESET_COLORS.map(preset => (
                                    <button
                                        key={preset.hex}
                                        type="button"
                                        onClick={() => setColor(preset.hex)}
                                        className={`w-7 h-7 rounded-full border-2 transition-all ${
                                            color === preset.hex
                                                ? 'border-foreground scale-110 ring-2 ring-offset-2 ring-primary'
                                                : 'border-transparent hover:scale-105'
                                        }`}
                                        style={{ backgroundColor: preset.hex }}
                                        title={preset.label}
                                    />
                                ))}
                                {/* Custom color input */}
                                <div className="relative">
                                    <input
                                        type="color"
                                        value={customColor || color}
                                        onChange={e => {
                                            setCustomColor(e.target.value);
                                            setColor(e.target.value);
                                        }}
                                        className="w-7 h-7 rounded-full cursor-pointer border-2 border-dashed border-muted-foreground/30"
                                        title="Couleur personnalisée"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Prévisualisation couleur */}
                    <div
                        className="rounded-lg p-3 sm:p-4 border"
                        style={{
                            backgroundColor: palette.bg,
                            borderColor: palette.border,
                        }}
                    >
                        <p className="text-xs font-medium mb-1" style={{ color: palette.textMuted }}>
                            Aperçu couleur
                        </p>
                        <p className="text-base sm:text-lg font-bold" style={{ color: palette.text }}>
                            {title || 'Titre de l\'événement'}
                        </p>
                        <p className="text-sm" style={{ color: palette.textMuted }}>
                            {subtitle || 'Sous-titre'}
                        </p>
                        <div className="flex gap-2 mt-2">
                            <span
                                className="text-xs px-2 py-1 rounded-full font-medium"
                                style={{
                                    backgroundColor: palette.button,
                                    color: palette.buttonText,
                                }}
                            >
                                En savoir plus
                            </span>
                        </div>
                    </div>

                    {/* Visibilité */}
                    <div className="space-y-2">
                        <Label>Visibilité</Label>
                        <div className="flex flex-wrap gap-2">
                            {(['all', 'tv', 'mobile'] as const).map(v => (
                                <button
                                    key={v}
                                    type="button"
                                    onClick={() => setVisibility(v)}
                                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                        visibility === v
                                            ? 'bg-primary text-primary-foreground'
                                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                                    }`}
                                >
                                    {v === 'all' ? 'Partout' : v === 'tv' ? 'TV uniquement' : 'Mobile uniquement'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Description Markdown */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="event-desc" className="flex items-center gap-2">
                                <AlignLeft className="w-4 h-4" /> Description
                            </Label>
                            <button
                                type="button"
                                onClick={() => setShowDescPreview(!showDescPreview)}
                                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                            >
                                {showDescPreview ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                {showDescPreview ? 'Éditer' : 'Aperçu'}
                            </button>
                        </div>

                        {showDescPreview ? (
                            <div
                                className="min-h-[120px] p-3 rounded-lg border border-border bg-muted/30 text-sm prose prose-sm max-w-none"
                                dangerouslySetInnerHTML={{
                                    __html: renderMarkdownPreview(description || '*Aucune description*'),
                                }}
                            />
                        ) : (
                            <textarea
                                id="event-desc"
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                placeholder="Description détaillée (supporte le Markdown : **gras**, *italique*, - listes, ## titres...)"
                                rows={5}
                                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            />
                        )}
                        <p className="text-xs text-muted-foreground">
                            Markdown supporté. Visible au clic sur la vignette (mobile).
                        </p>
                    </div>

                    {/* Images */}
                    <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                            <ImageIcon className="w-4 h-4" /> Images (1 à 6)
                        </Label>
                        {storageConfigured ? (
                            <ImageUploader
                                images={serverImages}
                                pendingFiles={pendingFiles}
                                maxImages={6}
                                onFilesAdded={handleFilesAdded}
                                onPendingRemove={handlePendingRemove}
                                onServerRemove={handleServerRemove}
                                onReorder={handleReorder}
                                disabled={isSaving}
                            />
                        ) : (
                            <div className="bg-muted rounded-lg p-4 text-sm text-muted-foreground text-center">
                                Le stockage S3 n'est pas configuré.<br />
                                Les images seront disponibles une fois MinIO / S3 activé.
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer sticky */}
                <div className="sticky bottom-0 bg-card border-t border-border px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
                    <Button variant="ghost" onClick={onClose} disabled={isSaving} className="sm:mr-auto order-last sm:order-first">
                        Annuler
                    </Button>

                    <div className="flex gap-2">
                        {/* Enregistrer en brouillon */}
                        <Button
                            variant="outline"
                            onClick={() => handleSave(false)}
                            disabled={isSaving}
                            className="gap-2 flex-1 sm:flex-none"
                        >
                            {isSaving ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Save className="w-4 h-4" />
                            )}
                            <span className="hidden sm:inline">{isUploading ? 'Upload images...' : 'Enregistrer'}</span>
                            <span className="sm:hidden">{isUploading ? 'Upload...' : 'Brouillon'}</span>
                        </Button>

                        {/* Enregistrer & Publier */}
                        <Button
                            onClick={() => handleSave(true)}
                            disabled={isSaving}
                            className="gap-2 flex-1 sm:flex-none"
                        >
                            <Send className="w-4 h-4" />
                            <span className="hidden sm:inline">{isEditing ? 'Mettre à jour & Publier' : 'Créer & Publier'}</span>
                            <span className="sm:hidden">Publier</span>
                        </Button>
                    </div>
                </div>
            </div>
        </>
    );
}
