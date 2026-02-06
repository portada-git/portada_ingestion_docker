// Global type definitions for the PortAda frontend

export interface UserSession {
  username: string;
  role: string;
  permissions: string[];
  full_name: string;
  email: string;
  isAuthenticated: boolean;
  access_token: string;
  expires_in: number;
}

export interface LoginRequest {
  username: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user_info: {
    username: string;
    role: string;
    permissions: string[];
    full_name: string;
    email: string;
  };
}

export interface UploadRequest {
  file: File;
  ingestion_type: 'extraction_data' | 'known_entities';
  publication?: string;
  entity_name?: string;
  data_path_delta_lake?: string;
}

export interface IngestionResponse {
  task_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  message: string;
  records_processed: number;
  started_at: string;
  completed_at?: string;
  file_validation?: FileValidation;
}

export interface FileValidation {
  is_valid: boolean;
  file_size: number;
  file_format: 'json' | 'yaml' | 'yml';
  record_count?: number;
  validation_errors: string[];
}

export interface IngestionStatusResponse {
  task_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  message: string;
  progress_percentage?: number;
  records_processed: number;
  estimated_total?: number;
  started_at: string;
  updated_at: string;
}

export interface AnalysisQuery {
  queryType: string;
  parameters: Record<string, any>;
  filters?: Record<string, any>;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface MissingDateEntry {
  date: string;
  edition: string;
  gap_duration?: string;
}

export interface MissingDatesRequest {
  publication_name: string;
  data_path?: string;
  date_file?: string;
  date_and_edition_list?: string;
  file_format?: 'json' | 'yaml' | 'yml' | 'txt';
  start_date?: string;
  end_date?: string;
}

export interface MissingDatesResponse {
  publication_name: string;
  query_type: string;
  missing_dates: MissingDateEntry[];
  total_missing: number;
  date_range_analyzed?: string;
}

export interface DuplicateRecord {
  log_id: string;
  date: string;
  edition: string;
  publication: string;
  uploaded_by: string;
  duplicate_count: number;
  duplicates_filter: string;
  duplicate_ids: string[];
}

export interface DuplicatesRequest {
  user_responsible?: string;
  publication?: string;
  start_date?: string;
  end_date?: string;
}

export interface DuplicatesResponse {
  duplicates: DuplicateRecord[];
  total_duplicates: number;
  filters_applied: Record<string, any>;
}

export interface StorageRecord {
  log_id: string;
  table_name: string;
  process_name: string;
  stage: number;
  records_stored: number;
  storage_path: string;
  created_at: string;
  metadata: Record<string, any>;
}

export interface ProcessRecord {
  log_id: string;
  process_name: string;
  stage: number;
  status: string;
  started_at: string;
  completed_at?: string;
  records_processed: number;
  metadata: Record<string, any>;
}

export interface KnownEntitiesResponse {
  entities: Array<{
    name: string;
    type: string;
    count: number;
  }>;
  total_entities: number;
  entity_types: string[];
}

export interface KnownEntityDetailResponse {
  name: string;
  type: string;
  data: Array<Record<string, any>>;
  total_records: number;
}

export interface DailyEntriesRequest {
  publication: string;
  start_date?: string;
  end_date?: string;
}

export interface DailyEntriesResponse {
  publication: string;
  daily_counts: Array<{
    date: string;
    count: number;
    publication: string;
  }>;
  total_entries: number;
  date_range: {
    start_date: string;
    end_date: string;
  };
}

export interface Publication {
  code: string;
  name: string;
  full_name: string;
}



export interface PublicationsResponse {

  publications: Publication[];

  total: number;

}



export interface DailyIngestionSummaryRequest {

  newspaper: string;

  start_date?: string;

  end_date?: string;

}



export interface DailyIngestionSummaryEntry {

  label: string;

  count: number;

  year?: number;

  month?: number;

  day?: number;

  edition?: string;

}



export type DailyIngestionSummaryResponse = DailyIngestionSummaryEntry[];
