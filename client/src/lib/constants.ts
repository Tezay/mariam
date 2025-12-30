import { MenuCategory, DietaryTag, Certification } from './api';

export const DEFAULT_CATEGORIES: MenuCategory[] = [
    { id: 'entree', label: 'Entrée', icon: 'salad', order: 1 },
    { id: 'plat', label: 'Plat principal', icon: 'utensils', order: 2 },
    { id: 'vg', label: 'Option végétarienne', icon: 'leaf', order: 3 },
    { id: 'dessert', label: 'Dessert', icon: 'cake-slice', order: 4 },
];

export const DEFAULT_DIETARY_TAGS: DietaryTag[] = [
    { id: 'vegetarian', label: 'Végétarien', icon: 'leaf', color: 'green' },
    { id: 'halal', label: 'Halal', icon: 'badge-check', color: 'teal' },
    { id: 'pork_free', label: 'Sans porc', icon: 'ban', color: 'orange' },
];

export const DEFAULT_CERTIFICATIONS: Certification[] = [
    { id: 'bio', label: 'Bio', icon: 'sprout', color: 'green' },
    { id: 'local', label: 'Local', icon: 'map-pin', color: 'blue' },
    { id: 'french_meat', label: 'Viande française', icon: 'flag', color: 'indigo' },
];
