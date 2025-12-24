// Fonction utilitaire de Shadcn/ui
// (Permet de fusionner des classes Tailwind de manière intelligente)
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}
