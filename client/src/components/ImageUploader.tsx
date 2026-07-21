/**
 * MARIAM - Composant d'upload d'images S3
 *
 * Upload drag-and-drop avec prévisualisation, réordonnement et suppression.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
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

const ACCEPTED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
];
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

  const processFiles = useCallback(
    (fileList: FileList | File[]) => {
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
    },
    [totalCount, maxImages, onFilesAdded]
  );

  // ------------------------------------------------------------------
  // Drag & drop handlers
  // ------------------------------------------------------------------

  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!disabled) setIsDragOver(true);
    },
    [disabled]
  );

  const onDragLeave = useCallback(() => setIsDragOver(false), []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (!disabled && e.dataTransfer.files.length) {
        processFiles(e.dataTransfer.files);
      }
    },
    [disabled, processFiles]
  );

  const onFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.length) {
        processFiles(e.target.files);
      }
      // Reset input pour permettre de ré-uploader le même fichier
      e.target.value = '';
    },
    [processFiles]
  );

  // ------------------------------------------------------------------
  // Rendu
  // ------------------------------------------------------------------

  return (
    <div className="space-y-3">
      {/* Erreurs */}
      {errors.length > 0 && (
        <div className="space-y-1 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {errors.map((err, i) => (
            <div key={i} className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
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
              className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted"
            >
              <img
                src={img.url}
                alt={img.filename || 'Image'}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/30" />
              {!disabled && (
                <>
                  <button
                    type="button"
                    onClick={() => onServerRemove(img.id)}
                    className="absolute right-1 top-1 rounded-full bg-destructive p-1 text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label="Supprimer l'image"
                    title="Supprimer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                  {/* Reorder buttons */}
                  {onReorder && images.length > 1 && (
                    <div className="absolute bottom-1 left-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      {idx > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const ids = images.map((i) => i.id);
                            [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
                            onReorder(ids);
                          }}
                          className="rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                          aria-label="Déplacer l'image avant"
                          title="Déplacer avant"
                        >
                          <ArrowLeft className="h-3 w-3" />
                        </button>
                      )}
                      {idx < images.length - 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const ids = images.map((i) => i.id);
                            [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]];
                            onReorder(ids);
                          }}
                          className="rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                          aria-label="Déplacer l'image après"
                          title="Déplacer après"
                        >
                          <ArrowRight className="h-3 w-3" />
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
              key={`pending-${file.name}-${file.size}-${file.lastModified}`}
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
          role="button"
          tabIndex={0}
          aria-label="Ajouter des images"
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          className={`cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            isDragOver
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/50 hover:bg-muted/50'
          } `}
        >
          <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Glissez-déposez ou cliquez pour ajouter</p>
          <p className="mt-1 text-xs text-muted-foreground">
            JPG, PNG, GIF, WebP, HEIC — Max 5 MB — {slotsLeft} emplacement
            {slotsLeft > 1 ? 's' : ''} restant{slotsLeft > 1 ? 's' : ''}
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
      <p className="text-right text-xs text-muted-foreground">
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

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div className="group relative aspect-square overflow-hidden rounded-lg border-2 border-dashed border-primary/30 bg-primary/5">
      {preview && (
        <img src={preview} alt={file.name} className="h-full w-full object-cover opacity-80" />
      )}
      {/* Badge "en attente" */}
      <div className="absolute bottom-0 left-0 right-0 bg-primary/80 py-0.5 text-center text-[10px] text-primary-foreground">
        En attente
      </div>
      {!disabled && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute right-1 top-1 rounded-full bg-destructive p-1 text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
          title="Retirer"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
