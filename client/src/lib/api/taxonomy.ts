export interface DietaryTag {
  id: string;
  label: string;
  icon: string;
  color: string;
  category_id: string;
  sort_order: number;
}

export interface DietaryTagCategory {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  tags: DietaryTag[];
}

export interface CertificationItem {
  id: string;
  name: string;
  official_name: string;
  issuer: string;
  scheme_type: 'public' | 'private';
  jurisdiction: 'france' | 'eu' | 'international';
  guarantee: string;
  logo_filename: string;
  category_id: string;
  sort_order: number;
}

export interface CertificationCategory {
  id: string;
  name: string;
  sort_order: number;
  certifications: CertificationItem[];
}

export interface TaxonomyData {
  dietary_tag_categories: DietaryTagCategory[];
  certification_categories: CertificationCategory[];
}
