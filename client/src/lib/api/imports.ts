import { api } from './client';
import type { MenuItem } from './menus';

export interface CsvUploadResponse {
  file_id: string;
  filename: string;
  columns: string[];
  preview_rows: Record<string, string>[];
  row_count: number;
  detected_delimiter: string | null;
  auto_mapping: {
    date?: string;
    categories?: Record<string, number>; // csv column → category id
  };
  detected_date_format?: string;
}

export interface ColumnMapping {
  csv_column: string;
  target_field: 'date' | 'category' | 'ignore';
  category_id?: number;
}

export interface DateConfig {
  mode: 'from_file' | 'align_week' | 'start_date';
  start_date?: string;
  skip_weekends: boolean;
  date_format?: string;
  auto_detect_tags?: boolean;
}

export interface CsvPreviewItem {
  category_id: number;
  name: string;
  order: number;
  tags: string[];
  certifications: string[];
}

export interface ImportPreviewResponse {
  menus: {
    date: string;
    date_display: string;
    items: CsvPreviewItem[];
    has_duplicate: boolean;
    existing_menu?: {
      id: number;
      status: string;
      items: MenuItem[];
    };
  }[];
  total_count: number;
  duplicates_count: number;
  new_count: number;
}

export interface ImportConfirmRequest {
  file_id: string;
  column_mapping: ColumnMapping[];
  date_config: DateConfig;
  duplicate_action: 'skip' | 'replace' | 'merge';
  auto_publish: boolean;
  restaurant_id?: number;
}

export interface ImportConfirmResponse {
  success: boolean;
  imported_count: number;
  replaced_count: number;
  skipped_count: number;
  message: string;
}

export interface CatalogImportUploadResponse {
  file_id: string;
  filename: string;
  columns: string[];
  preview_rows: Record<string, string>[];
  row_count: number;
  delimiter: string | null;
  suggested_name_column: string | null;
  /** The file carries the columns the catalogue export writes. */
  is_catalog_export: boolean;
  category_paths: string[];
  known_categories: Record<string, number>;
}

export interface CatalogImportPreviewDish {
  name: string;
  tags: string[];
  certifications: string[];
  is_duplicate: boolean;
  category_path?: string;
}

export interface CatalogImportPreviewResponse {
  dishes: CatalogImportPreviewDish[];
  total: number;
  new_count: number;
  duplicate_count: number;
  categories_to_create: string[];
}

export interface CatalogImportParams {
  file_id: string;
  name_column?: string;
  tag_columns?: string[];
  category_id?: number;
  auto_detect_tags?: boolean;
  /** Export file only: each category path of the file, to an id or 'create'. */
  category_map?: Record<string, string>;
}

export interface CatalogImportResult {
  created_count: number;
  skipped_count: number;
}

export const csvImportApi = {
  upload: async (file: File): Promise<CsvUploadResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/imports/menus/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 30000,
    });
    return response.data;
  },

  preview: async (
    fileId: string,
    columnMapping: ColumnMapping[],
    dateConfig: DateConfig,
    restaurantId?: number
  ): Promise<ImportPreviewResponse> => {
    const response = await api.post('/imports/menus/preview', {
      file_id: fileId,
      column_mapping: columnMapping,
      date_config: dateConfig,
      restaurant_id: restaurantId,
    });
    return response.data;
  },

  confirm: async (request: ImportConfirmRequest): Promise<ImportConfirmResponse> => {
    const response = await api.post('/imports/menus/confirm', request);
    return response.data;
  },
};

export const catalogImportApi = {
  upload: async (file: File): Promise<CatalogImportUploadResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/imports/catalog/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 30000,
    });
    return response.data;
  },

  preview: async (params: CatalogImportParams): Promise<CatalogImportPreviewResponse> => {
    const response = await api.post('/imports/catalog/preview', params);
    return response.data;
  },

  confirm: async (params: CatalogImportParams): Promise<CatalogImportResult> => {
    const response = await api.post('/imports/catalog/confirm', params);
    return response.data;
  },
};
