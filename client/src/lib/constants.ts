import { MenuCategory } from './api';

export const DEFAULT_CATEGORIES: MenuCategory[] = [
    { id: 'entree', label: 'Entrée', icon: 'salad', order: 1 },
    { id: 'plat', label: 'Plat principal', icon: 'utensils', order: 2 },
    { id: 'vg', label: 'Option végétarienne', icon: 'leaf', order: 3 },
    { id: 'dessert', label: 'Dessert', icon: 'cake-slice', order: 4 },
];

// Les tags et certifications sont désormais chargés dynamiquement
// depuis l'API /public/taxonomy — plus de constantes locales.
