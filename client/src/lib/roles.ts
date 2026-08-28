import { BookOpen, Eye, Pencil, Shield, type LucideIcon } from 'lucide-react';
import type { User } from '@/lib/api';

type Role = User['role'];

interface RoleDefinition {
  label: string;
  description: string;
  icon: LucideIcon;
}

export const ROLES: Record<Role, RoleDefinition> = {
  org_admin: {
    label: 'Superviseur',
    description: 'Suit tous les sites, sans les modifier',
    icon: Eye,
  },
  admin: {
    label: 'Administrateur',
    description: 'Accès complet, gestion des comptes',
    icon: Shield,
  },
  editor: {
    label: 'Éditeur',
    description: 'Crée et modifie les menus',
    icon: Pencil,
  },
  reader: {
    label: 'Lecteur',
    description: 'Consultation uniquement',
    icon: BookOpen,
  },
};

/** Roles a site admin may invite; a supervisor invites only its peers. */
export const SITE_ROLES = ['admin', 'editor', 'reader'] as const;

export function roleLabel(role: string | undefined): string {
  return ROLES[role as Role]?.label ?? role ?? '';
}

export function roleIcon(role: string | undefined): LucideIcon | undefined {
  return ROLES[role as Role]?.icon;
}
