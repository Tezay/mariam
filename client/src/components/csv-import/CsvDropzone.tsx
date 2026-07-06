import { useRef } from 'react';
import { Upload } from 'lucide-react';

interface CsvDropzoneProps {
    accept: string;
    hint: string;
    onFile: (file: File) => void;
}

/** Zone de dépôt/sélection d'un fichier pour les imports CSV/Excel. */
export function CsvDropzone({ accept, hint, onFile }: CsvDropzoneProps) {
    const fileRef = useRef<HTMLInputElement>(null);
    return (
        <div
            className="flex flex-col items-center gap-3 p-8 rounded-2xl border-2 border-dashed border-border cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
            onClick={() => fileRef.current?.click()}
        >
            <Upload className="w-8 h-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Choisir un fichier</p>
            <p className="text-xs text-muted-foreground">{hint}</p>
            <input
                ref={fileRef}
                type="file"
                accept={accept}
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }}
            />
        </div>
    );
}
