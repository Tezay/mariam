/**
 * MARIAM - Composant d'upload d'images S3
 *
 * Upload drag-and-drop avec prévisualisation, réordonnement et suppression.
 */
import { useState, useRef, useCallback } from 'react';
import { Upload, X, ArrowLeft, ArrowRight, AlertCircle } from 'lucide-react';
import type { EventImage } from '@/lib/api';

interface ImageUploaderProps {
    /** Images déjà stockées côté serveur */
    images: EventImage[];
    /** Fichiers locaux en attente d'upload */
    pendingFiles: File[];
    /** Nombre max d'images autorisées */
    maxImages?: number;
    /** Callback quand des fichiers sont ajoutés localement */
    onFilesAdded: (files: File[]) => void;
    /** Callback pour retirer un fichier local (par index) */
    onPendingRemove: (index: number) => void;
    /** Callback pour supprimer une image serveur (par ID) */
    onServerRemove: (imageId: number) => void;
    /** Callback pour réordonner (nouvelle liste d'IDs) */
    onReorder?: (imageIds: number[]) => void;
    /** Désactiver les interactions */
    disabled?: boolean;
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export function ImageUploader({
    images,
    pendingFiles,
    maxImages = 6,
    onFilesAdded,
    onPendingRemove,
    onServerRemove,
    onReorder,
    disabled = false,
}: ImageUploaderProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [errors, setErrors] = useState<string[]>([]);

    const totalCount = images.length + pendingFiles.length;
    const slotsLeft = maxImages - totalCount;

    // ------------------------------------------------------------------
    // Validation et ajout de fichiers
    // ------------------------------------------------------------------

    const processFiles = useCallback((fileList: FileList | File[]) => {
        const files = Array.from(fileList);
        const validFiles: File[] = [];
        const newErrors: string[] = [];

        for (const file of files) {
            if (validFiles.length + totalCount >= maxImages) {
                newErrors.push(`Maximum ${maxImages} images — fichier ignoré : ${file.name}`);
                break;
            }
            if (!ACCEPTED_TYPES.includes(file.type)) {
                newErrors.push(`Type non supporté : ${file.name}`);
                continue;
            }
            if (file.size > MAX_FILE_SIZE) {
                newErrors.push(`Fichier trop volumineux (max 5 MB) : ${file.name}`);
                continue;
            }
            validFiles.push(file);
        }

        if (newErrors.length) {
            setErrors(newErrors);
            setTimeout(() => setErrors([]), 5000);
        }

        if (validFiles.length) {
            onFilesAdded(validFiles);
        }
    }, [totalCount, maxImages, onFilesAdded]);

    // ------------------------------------------------------------------
    // Drag & drop handlers
    // ------------------------------------------------------------------

    const onDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        if (!disabled) setIsDragOver(true);
    }, [disabled]);

    const onDragLeave = useCallback(() => setIsDragOver(false), []);

    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        if (!disabled && e.dataTransfer.files.length) {
            processFiles(e.dataTransfer.files);
        }
    }, [disabled, processFiles]);

    const onFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.length) {
            processFiles(e.target.files);
        }
        // Reset input pour permettre de ré-uploader le même fichier
        e.target.value = '';
    }, [processFiles]);

    // ------------------------------------------------------------------
    // Rendu
    // ------------------------------------------------------------------

    return (
        <div className="space-y-3">
            {/* Erreurs */}
            {errors.length > 0 && (
                <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg space-y-1">
                    {errors.map((err, i) => (
                        <div key={i} className="flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                            <span>{err}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Grille de prévisualisation */}
            {(images.length > 0 || pendingFiles.length > 0) && (
                <div className="grid grid-cols-3 gap-2">
                    {/* Images serveur */}
                    {images.map((img, idx) => (
                        <div
                            key={`server-${img.id}`}
                            className="relative group aspect-square rounded-lg overflow-hidden border border-border bg-muted"
                        >
                            <img
                                src={img.url}
                                alt={img.filename || 'Image'}
                                className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
                            {!disabled && (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => onServerRemove(img.id)}
                                        className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                        title="Supprimer"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                    {/* Reorder buttons */}
                                    {onReorder && images.length > 1 && (
                                        <div className="absolute bottom-1 left-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {idx > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const ids = images.map(i => i.id);
                                                        [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
                                                        onReorder(ids);
                                                    }}
                                                    className="bg-black/60 text-white rounded-full p-1 hover:bg-black/80"
                                                    title="Déplacer avant"
                                                >
                                                    <ArrowLeft className="w-3 h-3" />
                                                </button>
                                            )}
                                            {idx < images.length - 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const ids = images.map(i => i.id);
                                                        [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]];
                                                        onReorder(ids);
                                                    }}
                                                    className="bg-black/60 text-white rounded-full p-1 hover:bg-black/80"
                                                    title="Déplacer après"
                                                >
                                                    <ArrowRight className="w-3 h-3" />
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    ))}

                    {/* Fichiers en attente (aperçu local) */}
                    {pendingFiles.map((file, index) => (
                        <PendingImagePreview
                            key={`pending-${index}`}
                            file={file}
                            onRemove={() => onPendingRemove(index)}
                            disabled={disabled}
                        />
                    ))}
                </div>
            )}

            {/* Zone d'upload */}
            {slotsLeft > 0 && !disabled && (
                <div
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    onClick={() => inputRef.current?.click()}
                    className={`
                        border-2 border-dashed rounded-lg p-6 text-center cursor-pointer
                        transition-colors
                        ${isDragOver
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/50 hover:bg-muted/50'
                        }
                    `}
                >
                    <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                        Glissez-déposez ou cliquez pour ajouter
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                        JPG, PNG, GIF, WebP, HEIC — Max 5 MB — {slotsLeft} emplacement{slotsLeft > 1 ? 's' : ''} restant{slotsLeft > 1 ? 's' : ''}
                    </p>
                    <input
                        ref={inputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif"
                        multiple
                        onChange={onFileSelect}
                        className="hidden"
                    />
                </div>
            )}

            {/* Compteur */}
            <p className="text-xs text-muted-foreground text-right">
                {totalCount} / {maxImages} images
            </p>
        </div>
    );
}

// ========================================
// Composant interne : aperçu fichier local
// ========================================

function PendingImagePreview({
    file,
    onRemove,
    disabled,
}: {
    file: File;
    onRemove: () => void;
    disabled: boolean;
}) {
    const [preview, setPreview] = useState<string | null>(null);

    // Générer un aperçu
    useState(() => {
        const url = URL.createObjectURL(file);
        setPreview(url);
        return () => URL.revokeObjectURL(url);
    });

    return (
        <div className="relative group aspect-square rounded-lg overflow-hidden border-2 border-dashed border-primary/30 bg-primary/5">
            {preview && (
                <img
                    src={preview}
                    alt={file.name}
                    className="w-full h-full object-cover opacity-80"
                />
            )}
            {/* Badge "en attente" */}
            <div className="absolute bottom-0 left-0 right-0 bg-primary/80 text-primary-foreground text-[10px] text-center py-0.5">
                En attente
            </div>
            {!disabled && (
                <button
                    type="button"
                    onClick={onRemove}
                    className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Retirer"
                >
                    <X className="w-3 h-3" />
                </button>
            )}
        </div>
    );
}
