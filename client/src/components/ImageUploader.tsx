import { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, X, ArrowLeft, ArrowRight, AlertCircle } from 'lucide-react';
import type { StoredImage } from '@/lib/api/events';
import { IMAGE_ACCEPT, IMAGE_MAX_MB, imageFileProblem } from '@/lib/image-files';

interface ImageUploaderProps {
  images: StoredImage[];
  pendingFiles: File[];
  maxImages?: number;
  onFilesAdded: (files: File[]) => void;
  onPendingRemove: (index: number) => void;
  onServerRemove: (imageId: number) => void;
  onReorder?: (imageIds: number[]) => void;
  disabled?: boolean;
}

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
        const problem = imageFileProblem(file);
        if (problem) {
          newErrors.push(`${problem} (${file.name})`);
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
      // Lets the same file be picked again.
      e.target.value = '';
    },
    [processFiles]
  );

  return (
    <div className="space-y-3">
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

      {(images.length > 0 || pendingFiles.length > 0) && (
        <div className="grid grid-cols-3 gap-2">
          {images.map((img, idx) => (
            <div
              key={`server-${img.id}`}
              className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted"
            >
              <img src={img.url} alt={`Image ${idx + 1}`} className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/30" />
              {!disabled && (
                <>
                  <button
                    type="button"
                    onClick={() => onServerRemove(img.id)}
                    className="absolute right-1 top-1 rounded-full bg-destructive p-1 text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
                    title="Supprimer"
                  >
                    <X className="h-3 w-3" />
                  </button>
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

      {slotsLeft > 0 && !disabled && (
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
            isDragOver
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/50 hover:bg-muted/50'
          } `}
        >
          <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Glissez-déposez ou cliquez pour ajouter</p>
          <p className="mt-1 text-xs text-muted-foreground">
            JPG, PNG, GIF, WebP, HEIC — {IMAGE_MAX_MB} Mo au plus — {slotsLeft} emplacement
            {slotsLeft > 1 ? 's' : ''} restant{slotsLeft > 1 ? 's' : ''}
          </p>
          <input
            ref={inputRef}
            type="file"
            accept={IMAGE_ACCEPT}
            multiple
            onChange={onFileSelect}
            className="hidden"
          />
        </div>
      )}

      <p className="text-right text-xs text-muted-foreground">
        {totalCount} / {maxImages} images
      </p>
    </div>
  );
}

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
