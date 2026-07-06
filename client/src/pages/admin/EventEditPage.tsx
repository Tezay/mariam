import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { eventsApi, Event, EventImage } from '@/lib/api';
import { EVENT_PRESET_COLORS, generateEventPalette } from '@/lib/color-utils';
import { notify } from '@/lib/toast';
import { ImageUploader } from '@/components/ImageUploader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
    ArrowLeft, Save, Send, Bold, Italic, List, ListOrdered, Link as LinkIcon,
    Loader2, Calendar, Palette, Eye, EyeOff, Image as ImageIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Tiptap toolbar ────────────────────────────────────────────────────────
function EditorToolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
    if (!editor) return null;

    const setLink = () => {
        const previous = editor.getAttributes('link').href as string | undefined;
        const url = window.prompt('URL du lien :', previous ?? 'https://');
        if (url === null) return;
        if (url === '') {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();
            return;
        }
        editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    };

    const tools: { label: string; icon: React.ReactNode; action: () => void; active?: boolean }[] = [
        {
            label: 'Gras',
            icon: <Bold className="w-3.5 h-3.5" />,
            action: () => editor.chain().focus().toggleBold().run(),
            active: editor.isActive('bold'),
        },
        {
            label: 'Italique',
            icon: <Italic className="w-3.5 h-3.5" />,
            action: () => editor.chain().focus().toggleItalic().run(),
            active: editor.isActive('italic'),
        },
        {
            label: 'Liste à puces',
            icon: <List className="w-3.5 h-3.5" />,
            action: () => editor.chain().focus().toggleBulletList().run(),
            active: editor.isActive('bulletList'),
        },
        {
            label: 'Liste numérotée',
            icon: <ListOrdered className="w-3.5 h-3.5" />,
            action: () => editor.chain().focus().toggleOrderedList().run(),
            active: editor.isActive('orderedList'),
        },
        {
            label: 'Lien',
            icon: <LinkIcon className="w-3.5 h-3.5" />,
            action: setLink,
            active: editor.isActive('link'),
        },
    ];

    return (
        <div className="flex items-center gap-0.5 p-1.5 border border-border rounded-xl bg-muted/40 flex-wrap">
            {tools.map(tool => (
                <button
                    key={tool.label}
                    type="button"
                    title={tool.label}
                    onClick={tool.action}
                    className={cn(
                        'p-2 rounded-lg transition-colors text-sm',
                        tool.active
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-background hover:text-foreground',
                    )}
                >
                    {tool.icon}
                </button>
            ))}
        </div>
    );
}

// ── Color picker (reused from EventEditor) ────────────────────────────────
function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
    return (
        <div className="flex flex-wrap gap-2 items-center">
            {EVENT_PRESET_COLORS.map(preset => (
                <button
                    key={preset.hex}
                    type="button"
                    title={preset.label}
                    onClick={() => onChange(preset.hex)}
                    className={cn(
                        'w-7 h-7 rounded-full border-2 transition-all',
                        value === preset.hex
                            ? 'border-foreground scale-110 ring-2 ring-offset-1 ring-primary'
                            : 'border-transparent hover:scale-105',
                    )}
                    style={{ backgroundColor: preset.hex }}
                />
            ))}
            <input
                type="color"
                value={value}
                onChange={e => onChange(e.target.value)}
                className="w-7 h-7 rounded-full cursor-pointer border-2 border-dashed border-muted-foreground/30"
                title="Couleur personnalisée"
            />
        </div>
    );
}

// ── Main page ─────────────────────────────────────────────────────────────
export function EventEditPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const isCreating = !id;

    const [loading, setLoading] = useState(!isCreating);
    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [showPreview, setShowPreview] = useState(false);

    // Form fields
    const [title, setTitle] = useState('');
    const [subtitle, setSubtitle] = useState('');
    const [eventDate, setEventDate] = useState('');
    const [color, setColor] = useState('#3498DB');
    const [visibility, setVisibility] = useState<'tv' | 'mobile' | 'all'>('all');
    const [status, setStatus] = useState<'draft' | 'published'>('draft');

    // Images
    const [serverImages, setServerImages] = useState<EventImage[]>([]);
    const [pendingFiles, setPendingFiles] = useState<File[]>([]);
    const [deletedImageIds, setDeletedImageIds] = useState<number[]>([]);
    const [storageConfigured, setStorageConfigured] = useState(false);

    // Saved event id (set after creation)
    const [savedEventId, setSavedEventId] = useState<number | null>(id ? Number(id) : null);

    // Tiptap editor
    const editor = useEditor({
        extensions: [
            StarterKit,
            Link.configure({ openOnClick: false }),
            Placeholder.configure({ placeholder: 'Décrivez l\'événement…' }),
        ],
        content: '',
        onUpdate: () => setIsDirty(true),
    });

    // Load existing event
    useEffect(() => {
        eventsApi.storageStatus()
            .then(configured => setStorageConfigured(configured))
            .catch(() => setStorageConfigured(false));

        if (isCreating) return;
        setLoading(true);
        eventsApi.get(Number(id)).then(event => {
            setTitle(event.title);
            setSubtitle(event.subtitle ?? '');
            setEventDate(event.event_date);
            setColor(event.color ?? '#3498DB');
            setVisibility(event.visibility);
            setStatus(event.status);
            setServerImages(event.images ?? []);
            // Insert description into Tiptap — treat as plain text if no HTML tags
            if (editor && event.description) {
                const isHtml = /<[a-z][\s\S]*>/i.test(event.description);
                if (isHtml) {
                    editor.commands.setContent(event.description);
                } else {
                    editor.commands.setContent(`<p>${event.description.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br/>')}</p>`);
                }
            }
        }).catch(() => {
            notify.error('Événement introuvable');
            navigate('/admin/events');
        }).finally(() => {
            setLoading(false);
            setIsDirty(false);
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, isCreating]);

    const handleSave = useCallback(async (publish = false) => {
        if (!title.trim()) { notify.error('Le titre est requis'); return; }
        if (!eventDate) { notify.error('La date est requise'); return; }

        setIsSaving(true);
        try {
            const description = editor?.getHTML() ?? '';
            const payload: Partial<Event> = {
                title: title.trim(),
                subtitle: subtitle.trim() || undefined,
                description: description === '<p></p>' ? undefined : description,
                event_date: eventDate,
                color,
                visibility,
                status: publish ? 'published' : status,
            };

            let savedEvent: Event;
            if (isCreating) {
                savedEvent = await eventsApi.create(payload);
                setSavedEventId(savedEvent.id);
            } else {
                savedEvent = await eventsApi.update(Number(id), payload);
            }

            // Upload pending images
            if (pendingFiles.length > 0 && storageConfigured) {
                setIsUploading(true);
                for (const file of pendingFiles) {
                    try { await eventsApi.uploadImage(savedEvent.id, file); } catch { /* skip */ }
                }
                setPendingFiles([]);
                setIsUploading(false);
            }

            // Delete removed images
            for (const imgId of deletedImageIds) {
                try { await eventsApi.deleteImage(savedEvent.id, imgId); } catch { /* skip */ }
            }
            setDeletedImageIds([]);

            if (publish && savedEvent.status !== 'published') {
                await eventsApi.publish(savedEvent.id);
                setStatus('published');
            } else {
                setStatus(savedEvent.status);
            }

            setIsDirty(false);
            notify.success(
                isCreating ? 'Événement créé' : 'Modifications enregistrées',
                publish ? 'Publié et visible sur le menu' : undefined,
            );

            if (isCreating) {
                navigate(`/admin/events/${savedEvent.id}/edit`, { replace: true });
            }
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
            notify.error(msg ?? "Erreur lors de l'enregistrement");
        } finally {
            setIsSaving(false);
            setIsUploading(false);
        }
    }, [title, subtitle, eventDate, color, visibility, status, editor, isCreating, id, pendingFiles, deletedImageIds, storageConfigured, navigate]);

    const palette = generateEventPalette(color);

    if (loading) {
        return (
            <div className="container-mariam py-6 flex flex-col gap-6 max-w-4xl">
                <div className="flex items-center gap-3">
                    <Skeleton className="w-9 h-9 rounded-xl" />
                    <Skeleton className="h-6 w-40" />
                </div>
                <div className="flex flex-col lg:flex-row gap-6">
                    <div className="flex-1 flex flex-col gap-5">
                        <Skeleton className="h-12 rounded-xl" />
                        <Skeleton className="h-9 rounded-xl" />
                        <Skeleton className="h-48 rounded-xl" />
                    </div>
                    <Skeleton className="lg:w-72 h-64 rounded-xl" />
                </div>
            </div>
        );
    }

    return (
        <div className="container-mariam py-4 sm:py-6 max-w-4xl">
            {/* Sticky mobile header / breadcrumb */}
            <div className="flex items-center gap-3 sticky top-0 z-10 bg-background/95 backdrop-blur-sm py-3 -mx-4 px-4 sm:static sm:bg-transparent sm:backdrop-blur-none sm:p-0 sm:mx-0 border-b border-border sm:border-0 mb-6">
                <button
                    type="button"
                    onClick={() => navigate('/admin/events')}
                    className="flex items-center justify-center w-9 h-9 rounded-xl border border-border hover:bg-muted transition-colors shrink-0"
                >
                    <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">Événements</p>
                    <p className="text-sm font-semibold truncate">
                        {isCreating ? 'Nouvel événement' : (title || 'Modifier l\'événement')}
                    </p>
                </div>
                {isDirty && (
                    <span className="hidden sm:inline text-xs text-amber-600 font-medium px-2 py-1 rounded-lg bg-amber-50 border border-amber-200">
                        Non enregistré
                    </span>
                )}
                {/* Status badge */}
                {!isCreating && (
                    <span className={cn(
                        'hidden sm:inline text-xs font-semibold px-2.5 py-1 rounded-full border',
                        status === 'published'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-orange-50 text-orange-700 border-orange-200',
                    )}>
                        {status === 'published' ? 'Publié' : 'Brouillon'}
                    </span>
                )}
            </div>

            <div className="flex flex-col lg:flex-row gap-6 pb-24">
                {/* ── Main column ── */}
                <div className="flex-1 flex flex-col gap-5">
                    {/* Title — styled like h1 */}
                    <div>
                        <input
                            type="text"
                            value={title}
                            onChange={e => { setTitle(e.target.value); setIsDirty(true); }}
                            placeholder="Titre de l'événement"
                            maxLength={100}
                            className="w-full text-2xl sm:text-3xl font-bold bg-transparent border-0 border-b-2 border-border focus:border-primary outline-none placeholder:text-muted-foreground/40 py-2 pb-3 transition-colors"
                        />
                    </div>

                    {/* Subtitle */}
                    <Input
                        value={subtitle}
                        onChange={e => { setSubtitle(e.target.value); setIsDirty(true); }}
                        placeholder="Sous-titre (optionnel)"
                        maxLength={200}
                        className="text-base text-muted-foreground border-0 border-b border-border rounded-none px-0 focus-visible:ring-0 focus-visible:border-primary"
                    />

                    {/* Color preview */}
                    {(title || subtitle) && (
                        <div
                            className="rounded-xl p-3 border"
                            style={{ backgroundColor: palette.bg, borderColor: palette.border }}
                        >
                            <p className="text-sm font-bold" style={{ color: palette.text }}>
                                {title || 'Titre'}
                            </p>
                            {subtitle && (
                                <p className="text-xs mt-0.5" style={{ color: palette.textMuted }}>{subtitle}</p>
                            )}
                        </div>
                    )}

                    {/* Tiptap editor */}
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                                Description
                            </Label>
                            <button
                                type="button"
                                onClick={() => setShowPreview(!showPreview)}
                                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                                {showPreview ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                {showPreview ? 'Éditer' : 'Aperçu'}
                            </button>
                        </div>

                        {showPreview ? (
                            <div
                                className="min-h-32 p-4 rounded-xl border border-border bg-muted/20 prose prose-sm max-w-none text-sm"
                                dangerouslySetInnerHTML={{ __html: editor?.getHTML() ?? '' }}
                            />
                        ) : (
                            <>
                                <EditorToolbar editor={editor} />
                                <div className="relative">
                                    <EditorContent
                                        editor={editor}
                                        className="min-h-32 rounded-xl border border-border bg-background px-4 py-3 text-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 [&_.tiptap]:outline-none [&_.tiptap]:min-h-28 [&_.tiptap_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.tiptap_p.is-editor-empty:first-child::before]:text-muted-foreground [&_.tiptap_p.is-editor-empty:first-child::before]:float-left [&_.tiptap_p.is-editor-empty:first-child::before]:pointer-events-none [&_.tiptap_ul]:list-disc [&_.tiptap_ul]:pl-5 [&_.tiptap_ol]:list-decimal [&_.tiptap_ol]:pl-5 [&_.tiptap_a]:text-primary [&_.tiptap_a]:underline"
                                    />
                                </div>
                            </>
                        )}
                        <p className="text-[10px] text-muted-foreground">
                            Visible au clic sur la vignette mobile.
                        </p>
                    </div>

                    {/* Images */}
                    <div className="flex flex-col gap-2">
                        <Label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                            <ImageIcon className="w-3.5 h-3.5" /> Images (1 à 6)
                        </Label>
                        {storageConfigured ? (
                            <ImageUploader
                                images={serverImages}
                                pendingFiles={pendingFiles}
                                maxImages={6}
                                onFilesAdded={files => { setPendingFiles(prev => [...prev, ...files]); setIsDirty(true); }}
                                onPendingRemove={i => setPendingFiles(prev => prev.filter((_, idx) => idx !== i))}
                                onServerRemove={imgId => {
                                    setServerImages(prev => prev.filter(img => img.id !== imgId));
                                    setDeletedImageIds(prev => [...prev, imgId]);
                                    setIsDirty(true);
                                }}
                                onReorder={async imgIds => {
                                    const reordered = imgIds
                                        .map(imgId => serverImages.find(img => img.id === imgId))
                                        .filter(Boolean) as EventImage[];
                                    setServerImages(reordered);
                                    if (savedEventId) {
                                        try { await eventsApi.reorderImages(savedEventId, imgIds); } catch { /* ignore */ }
                                    }
                                }}
                                disabled={isSaving}
                            />
                        ) : (
                            <div className="rounded-xl border border-border bg-muted p-4 text-sm text-muted-foreground text-center">
                                Le stockage S3 n'est pas configuré.
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Sidebar (desktop right / mobile bottom) ── */}
                <aside className="lg:w-72 shrink-0 flex flex-col gap-5">
                    {/* Date */}
                    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
                        <Label htmlFor="event-date" className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                            <Calendar className="w-3.5 h-3.5" /> Date
                        </Label>
                        <Input
                            id="event-date"
                            type="date"
                            value={eventDate}
                            onChange={e => { setEventDate(e.target.value); setIsDirty(true); }}
                            className="h-10"
                        />
                    </div>

                    {/* Color */}
                    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
                        <Label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                            <Palette className="w-3.5 h-3.5" /> Couleur
                        </Label>
                        <ColorPicker value={color} onChange={c => { setColor(c); setIsDirty(true); }} />
                    </div>

                    {/* Visibility */}
                    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
                        <Label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                            Visibilité
                        </Label>
                        <div className="flex flex-col gap-1.5">
                            {([
                                { v: 'all' as const, label: 'Partout (TV + Mobile)' },
                                { v: 'tv' as const, label: 'TV uniquement' },
                                { v: 'mobile' as const, label: 'Mobile uniquement' },
                            ]).map(({ v, label }) => (
                                <button
                                    key={v}
                                    type="button"
                                    onClick={() => { setVisibility(v); setIsDirty(true); }}
                                    className={cn(
                                        'w-full text-left px-3 py-2 rounded-xl text-sm transition-colors',
                                        visibility === v
                                            ? 'bg-primary text-primary-foreground font-medium'
                                            : 'bg-muted text-muted-foreground hover:bg-muted/80',
                                    )}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Desktop save buttons */}
                    <div className="hidden lg:flex flex-col gap-2">
                        <Button
                            variant="outline"
                            onClick={() => handleSave(false)}
                            disabled={isSaving}
                            className="w-full gap-2"
                        >
                            {isSaving && !status ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            {isUploading ? 'Upload…' : 'Enregistrer le brouillon'}
                        </Button>
                        <Button
                            onClick={() => handleSave(true)}
                            disabled={isSaving}
                            className="w-full gap-2"
                        >
                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            {status === 'published' ? 'Mettre à jour' : 'Publier'}
                        </Button>
                    </div>
                </aside>
            </div>

            {/* Fixed bottom save bar (mobile + tablet) */}
            <div className="lg:hidden fixed bottom-16 left-0 right-0 z-40 px-4 pb-2">
                <div className="flex items-center gap-2 bg-card border border-border rounded-2xl shadow-lg px-4 py-3">
                    {isDirty && (
                        <span className="text-xs text-amber-600 font-medium shrink-0">Non enregistré</span>
                    )}
                    <div className="flex-1" />
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSave(false)}
                        disabled={isSaving}
                        className="gap-1.5"
                    >
                        {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        {isUploading ? 'Upload…' : 'Brouillon'}
                    </Button>
                    <Button
                        size="sm"
                        onClick={() => handleSave(true)}
                        disabled={isSaving}
                        className="gap-1.5"
                    >
                        <Send className="w-3.5 h-3.5" />
                        {status === 'published' ? 'Mettre à jour' : 'Publier'}
                    </Button>
                </div>
            </div>
        </div>
    );
}
