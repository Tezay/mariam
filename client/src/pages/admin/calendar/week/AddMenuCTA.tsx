import { Plus } from 'lucide-react';

interface AddMenuCTAProps {
    onAdd: () => void;
}

export function AddMenuCTA({ onAdd }: AddMenuCTAProps) {
    return (
        <button
            type="button"
            onClick={onAdd}
            className="w-full flex flex-col items-center justify-center gap-1.5 py-6 rounded-xl border-2 border-dashed border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-colors"
        >
            <Plus className="w-5 h-5" />
            <span className="text-xs font-medium">Créer un menu</span>
        </button>
    );
}
