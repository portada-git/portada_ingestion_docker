/**
 * Enhanced API service for PortAda backend integration
 * Features: error handling, request/response interceptors, retry logic, and TypeScript support
 */

import { 
  LoginRequest, 
  LoginResponse, 
  IngestionResponse, 
  IngestionStatusResponse,
  MissingDatesRequest,
  MissingDatesResponse,
  DuplicatesRequest,
  DuplicatesResponse,
  KnownEntitiesResponse,
  KnownEntityDetailResponse,
  DailyEntriesRequest,
  DailyEntriesResponse,
  PublicationsResponse
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8001/api';

// Types for interceptors
type RequestInterceptor = (config: RequestInit & { url: string }) => RequestInit & { url: string };
type ResponseInterceptor = (response: Response) => Response | Promise<Response>;
type ErrorInterceptor = (error: Error) => Error | Promise<Error>;

interface RetryConfig {
  maxRetries: number;
  retryDelay: number;
  retryCondition?: (error: Error) => boolean;
}

interface ApiError extends Error {
  status?: number;
  code?: string;
  details?: any;
}

class ApiService {
  private baseUrl: string;
  private token: string | null = null;
  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];
  private errorInterceptors: ErrorInterceptor[] = [];
  private retryConfig: RetryConfig = {
    maxRetries: 3,
    retryDelay: 1000,
    retryCondition: (error: ApiError) => {
      // Retry on network errors or 5xx server errors
      return !error.status || error.status >= 500;
    }
  };

  constructor() {
    this.baseUrl = API_BASE_URL;
    // Load token from localStorage on initialization
    this.token = localStorage.getItem('access_token');
    
    // Set up default interceptors
    this.setupDefaultInterceptors();
  }

  private setupDefaultInterceptors() {
    // Request interceptor for logging
    this.addRequestInterceptor((config) => {
      console.log(`[API] ${config.method || 'GET'} ${config.url}`);
      return config;
    });

    // Response interceptor for logging
    this.addResponseInterceptor((response) => {
      console.log(`[API] Response ${response.status} for ${response.url}`);
      return response;
    });

    // Error interceptor for enhanced error handling
    this.addErrorInterceptor((error: ApiError) => {
      console.error('[API] Error:', error.message, error.details);
      
      // Handle authentication errors globally
      if (error.status === 401) {
        console.warn('[API] Authentication failed - clearing token');
        this.clearToken();
        
        // Dispatch a custom event to notify components
        window.dispatchEvent(new CustomEvent('auth-error', { 
          detail: { error: error.message } 
        }));
      }
      
      return error;
    });
  }

  // Interceptor management
  addRequestInterceptor(interceptor: RequestInterceptor): void {
    this.requestInterceptors.push(interceptor);
  }

  addResponseInterceptor(interceptor: ResponseInterceptor): void {
    this.responseInterceptors.push(interceptor);
  }

  addErrorInterceptor(interceptor: ErrorInterceptor): void {
    this.errorInterceptors.push(interceptor);
  }

  setRetryConfig(config: Partial<RetryConfig>): void {
    this.retryConfig = { ...this.retryConfig, ...config };
  }

  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (this.token) {
      // Use x-api-key for backend authentication
      headers['x-api-key'] = this.token;
    }
    
    return headers;
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private createApiError(message: string, status?: number, details?: any): ApiError {
    const error = new Error(message) as ApiError;
    error.status = status;
    error.details = details;
    return error;
  }

  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    attempt: number = 1
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const apiError = error as ApiError;
      
      // Apply error interceptors
      let processedError = apiError;
      for (const interceptor of this.errorInterceptors) {
        processedError = await interceptor(processedError);
      }

      // Check if we should retry
      if (
        attempt < this.retryConfig.maxRetries &&
        this.retryConfig.retryCondition?.(processedError)
      ) {
        console.log(`[API] Retrying request (attempt ${attempt + 1}/${this.retryConfig.maxRetries})`);
        await this.sleep(this.retryConfig.retryDelay * attempt);
        return this.executeWithRetry(operation, attempt + 1);
      }

      throw processedError;
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    return this.executeWithRetry(async () => {
      const url = `${this.baseUrl}${endpoint}`;
      
      let config: RequestInit & { url: string } = {
        ...options,
        url,
        credentials: 'include', // IMPORTANT: Include cookies in requests
        headers: {
          ...this.getAuthHeaders(),
          ...options.headers,
        },
      };

      // Apply request interceptors
      for (const interceptor of this.requestInterceptors) {
        config = interceptor(config);
      }

      try {
        let response = await fetch(config.url, config);
        
        // Apply response interceptors
        for (const interceptor of this.responseInterceptors) {
          response = await interceptor(response);
        }
        
        if (!response.ok) {
          let errorData: any = {};
          try {
            errorData = await response.json();
          } catch {
            // Response is not JSON
          }

          if (response.status === 401) {
            // Token expired or invalid, clear it
            this.clearToken();
            throw this.createApiError('Authentication required', 401, errorData);
          }
          
          const message = errorData.detail || errorData.message || `HTTP error! status: ${response.status}`;
          throw this.createApiError(message, response.status, errorData);
        }

        // Handle empty responses
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          return await response.json();
        } else {
          return {} as T;
        }
      } catch (error) {
        if (error instanceof TypeError && error.message.includes('fetch')) {
          // Network error
          throw this.createApiError('Network error: Unable to connect to server', undefined, error);
        }
        throw error;
      }
    });
  }

  // File upload with enhanced error handling
  private async uploadRequest<T>(
    endpoint: string,
    formData: FormData,
    onProgress?: (progress: number) => void
  ): Promise<T> {
    return this.executeWithRetry(async () => {
      const url = `${this.baseUrl}${endpoint}`;
      
      let config: RequestInit & { url: string } = {
        method: 'POST',
        url,
        credentials: 'include', // IMPORTANT: Include cookies in requests
        headers: {
          // Don't set Content-Type for FormData, let browser set it
          'Authorization': this.token ? `Bearer ${this.token}` : '',
        },
        body: formData,
      };

      // Apply request interceptors (excluding Content-Type for FormData)
      for (const interceptor of this.requestInterceptors) {
        config = interceptor(config);
      }

      try {
        // Create XMLHttpRequest for progress tracking if callback provided
        if (onProgress) {
          return new Promise<T>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            
            xhr.upload.addEventListener('progress', (event) => {
              if (event.lengthComputable) {
                const progress = (event.loaded / event.total) * 100;
                onProgress(progress);
              }
            });

            xhr.addEventListener('load', async () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                try {
                  const result = JSON.parse(xhr.responseText);
                  resolve(result);
                } catch {
                  resolve({} as T);
                }
              } else {
                let errorData: any = {};
                try {
                  errorData = JSON.parse(xhr.responseText);
                } catch {
                  // Response is not JSON
                }
                
                if (xhr.status === 401) {
                  this.clearToken();
                  reject(this.createApiError('Authentication required', 401, errorData));
                } else {
                  const message = errorData.detail || errorData.message || `HTTP error! status: ${xhr.status}`;
                  reject(this.createApiError(message, xhr.status, errorData));
                }
              }
            });

            xhr.addEventListener('error', () => {
              reject(this.createApiError('Network error: Upload failed', undefined, xhr));
            });

            xhr.open('POST', config.url);
            if (config.headers && typeof config.headers === 'object') {
              Object.entries(config.headers).forEach(([key, value]) => {
                if (key !== 'Content-Type' && typeof value === 'string') {
                  xhr.setRequestHeader(key, value);
                }
              });
            }
            xhr.send(formData);
          });
        } else {
          // Use fetch for simple uploads without progress
          let response = await fetch(config.url, config);
          
          // Apply response interceptors
          for (const interceptor of this.responseInterceptors) {
            response = await interceptor(response);
          }
          
          if (!response.ok) {
            let errorData: any = {};
            try {
              errorData = await response.json();
            } catch {
              // Response is not JSON
            }

            if (response.status === 401) {
              this.clearToken();
              throw this.createApiError('Authentication required', 401, errorData);
            }
            
            const message = errorData.detail || errorData.message || `HTTP error! status: ${response.status}`;
            throw this.createApiError(message, response.status, errorData);
          }

          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            return await response.json();
          } else {
            return {} as T;
          }
        }
      } catch (error) {
        if (error instanceof TypeError && error.message.includes('fetch')) {
          throw this.createApiError('Network error: Unable to connect to server', undefined, error);
        }
        throw error;
      }
    });
  }

  setToken(token: string) {
    this.token = token;
    localStorage.setItem('access_token', token);
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('access_token');
  }

  isAuthenticated(): boolean {
    return !!this.token;
  }

  // Authentication
  async login(credentials: LoginRequest): Promise<LoginResponse> {
    // Mock login for PortAda Backend (x-api-key)
    // The backend auto-signs up users based on x-api-key, so we just accept any username
    const mockResponse: LoginResponse = {
        access_token: credentials.username,
        token_type: 'api_key',
        expires_in: 3600 * 24, // 24 hours
        user_info: {
            username: credentials.username,
            role: 'user',
            permissions: ['read', 'write', 'upload'],
            full_name: credentials.username,
            email: ''
        }
    };
    
    // Store the token
    this.setToken(mockResponse.access_token);
    
    // Simulate network delay
    await this.sleep(500);
    
    return mockResponse;
  }

  async logout(): Promise<void> {
    try {
      await this.request('/ingest/auth/logout', {
        method: 'POST',
      });
    } finally {
      // Always clear token, even if logout request fails
      this.clearToken();
    }
  }

  async getCurrentUser() {
    return this.request('/ingest/auth/me');
  }

  // Ingestion
  async uploadFile(
    file: File, 
    ingestionType: 'extraction_data' | 'known_entities',
    _publication?: string,
    entityName?: string,
    _dataPathDeltaLake?: string,
    onProgress?: (progress: number) => void
  ): Promise<IngestionResponse> {
    const formData = new FormData();
    
    let endpoint = '';
    
    if (ingestionType === 'extraction_data') {
        // Backend /ingest/entry
        formData.append('files', file);
        endpoint = '/ingest/entry';
    } else {
        // Backend /ingest/entity
        formData.append('file', file);
        const typeParam = entityName || 'unknown';
        endpoint = `/ingest/entity?type=${encodeURIComponent(typeParam)}`;
    }
    
    const response: any = await this.uploadRequest(endpoint, formData, onProgress);
    
    return {
        task_id: response.file_ids ? response.file_ids[0] : response.file_id,
        status: 'completed',
        message: response.message,
        records_processed: response.count || 1,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        file_validation: { is_valid: true, errors: [], warnings: [] } as any // force type
    };
  }

  async listUploadFiles(params?: {
    status?: string;
    filename?: string;
    date_from?: string;
    date_to?: string;
    file_type?: string;
  }) {
    const urlParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value) urlParams.append(key, String(value));
      });
    }
    const queryString = urlParams.toString();
    // Mapping to audit process for history
    return this.request(`/audit/process${queryString ? `?${queryString}` : ''}`);
  }

  async getIngestionTasks(_status?: string) {
    return this.request(`/audit/process`);
  }

  // Alias for backward compatibility
  async getIngestionStatus(_status?: string): Promise<IngestionStatusResponse> {
    return this.request<IngestionStatusResponse>(`/audit/process`);
  }

  // Alias for backward compatibility
  async getIngestionHistory(params?: any) {
    return this.listUploadFiles(params);
  }

  async cancelTask(_taskId: string) {
    // Not implemented in backend
    return Promise.resolve({ success: true, message: 'Not supported' });
  }

  async getProcessStatus() {
    return this.request('/audit/process');
  }

  // Analysis - Basic Queries
  async getPublications(): Promise<PublicationsResponse> {
    return this.request('/queries/publications');
  }

  async getKnownEntities(): Promise<KnownEntitiesResponse> {
    return this.request<KnownEntitiesResponse>('/queries/known-entities');
  }

  async getKnownEntityDetail(name: string): Promise<KnownEntityDetailResponse> {
    return this.request<KnownEntityDetailResponse>(`/queries/known-entities/${name}`);
  }

  async getDailyEntries(request: DailyEntriesRequest): Promise<DailyEntriesResponse> {
    const params = new URLSearchParams();
    if (request.publication) params.append('publication', request.publication);
    if (request.start_date) params.append('start_date', request.start_date);
    if (request.end_date) params.append('end_date', request.end_date);
    
    // Backend returns [{y, m, d, count}, ...]
    const rawData = await this.request<any[]>(`/queries/entries/count?${params.toString()}`);
    
    const daily_counts = Array.isArray(rawData) ? rawData.map(item => {
        // Handle rollup rows where y,m,d might be null? Pyspark rollup includes nulls for subtotals.
        // If y, m, d present:
        if (item.y && item.m && item.d) {
             const date = `${item.y}-${String(item.m).padStart(2, '0')}-${String(item.d).padStart(2, '0')}`;
             return {
                 date: date,
                 count: item.count,
                 publication: request.publication || ''
             };
        }
        return null; // Skip rollup totals for now
    }).filter(x => x !== null) as any[] : [];

    return {
      publication: request.publication || '',
      daily_counts: daily_counts,
      total_entries: daily_counts.reduce((sum, x) => sum + x.count, 0),
      date_range: {
        start_date: request.start_date || '',
        end_date: request.end_date || ''
      }
    };
  }

  // Analysis - Missing Dates
  async getMissingDates(request: MissingDatesRequest): Promise<MissingDatesResponse> {
    return this.request<MissingDatesResponse>('/analysis/missing-dates', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async analyzeMissingDatesFile(file: File, publication: string, onProgress?: (progress: number) => void): Promise<MissingDatesResponse> {
     return this.uploadDatesFile(file, publication, onProgress);
  }

  async analyzeMissingDatesRange(request: {
    start_date: string;
    end_date: string;
    publication: string;
  }): Promise<MissingDatesResponse> {
    const params = new URLSearchParams();
    params.append('publication', request.publication);
    if(request.start_date) params.append('start_date', request.start_date);
    if(request.end_date) params.append('end_date', request.end_date);

    return this.request<any>(`/queries/gaps?${params.toString()}`, {
      method: 'GET'
    }) as unknown as Promise<MissingDatesResponse>;
  }

  async uploadDatesFile(file: File, publicationName: string, onProgress?: (progress: number) => void) {
    const formData = new FormData();
    formData.append('file', file);

    return this.uploadRequest<MissingDatesResponse>(`/queries/gaps/file?publication=${encodeURIComponent(publicationName)}`, formData, onProgress);
  }

  // Analysis - Duplicates
  async getDuplicates(request: DuplicatesRequest): Promise<DuplicatesResponse> {
     return this.getDuplicatesMetadata({
         user: request.user_responsible,
         publication: request.publication,
         start_date: request.start_date,
         end_date: request.end_date
     });
  }

  async getDuplicatesMetadata(request: {
    user?: string;
    publication?: string;
    start_date?: string;
    end_date?: string;
  }): Promise<DuplicatesResponse> {
    const params = new URLSearchParams();
    if (request.publication) params.append('publication', request.publication);
    if (request.user) params.append('user', request.user);
    if (request.start_date) params.append('start_date', request.start_date);
    if (request.end_date) params.append('end_date', request.end_date);

    const data = await this.request<any[]>(`/audit/duplicates/metadata?${params.toString()}`, {
      method: 'GET'
    });

    return {
      duplicates: data,
      total_duplicates: data.length,
      filters_applied: request
    };
  }

  async getDuplicateDetails(logId: string) {
    return this.request(`/audit/duplicates/records/${logId}`);
  }

  // Analysis - Storage and Process Metadata (NEW ENDPOINTS)
  async getStorageMetadata(filters?: {
    publication?: string;
    table_name?: string;
    process_name?: string;
    stage?: string;
    start_date?: string;
    end_date?: string;
  }) {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });
    }
    const queryString = params.toString();
    return this.request(`/metadata/storage${queryString ? `?${queryString}` : ''}`);
  }

  async getProcessMetadata(filters?: {
    publication?: string;
    process_name?: string;
    status?: string;
    start_date?: string;
    end_date?: string;
  }) {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });
    }
    const queryString = params.toString();
    return this.request(`/metadata/process${queryString ? `?${queryString}` : ''}`);
  }

  async getFieldLineage(storedLogId: string) {
    return this.request<any>(`/metadata/lineage?stored_log_id=${storedLogId}`);
  }

  async getMetadataPublications() {
    return this.request('/metadata/publications');
  }

  async getMetadataSummary() {
    return this.request('/metadata/summary');
  }

  async getFieldLineageMetadata(publication?: string) {
    const params = publication ? `?publication=${encodeURIComponent(publication)}` : '';
    return this.request(`/metadata/field-lineage${params}`);
  }

  async getDailyIngestionSummary(request: {
    newspaper: string;
    start_date?: string;
    end_date?: string;
  }): Promise<any> {
    const params = new URLSearchParams();
    params.append('newspaper', request.newspaper);
    if (request.start_date) {
      params.append('start_date', request.start_date);
    }
    if (request.end_date) {
      params.append('end_date', request.end_date);
    }
    return this.request(`/statistics/daily-ingestion-summary?${params.toString()}`);
  }

  async getDuplicatesMetadataNew(publication?: string) {
    const params = publication ? `?publication=${encodeURIComponent(publication)}` : '';
    return this.request(`/metadata/duplicates${params}`);
  }

  // Admin endpoints
  async cleanupFiles(maxAgeHours?: number) {
    const params = maxAgeHours ? `?max_age_hours=${maxAgeHours}` : '';
    return this.request(`/ingestion/cleanup${params}`, {
      method: 'POST',
    });
  }

  async cleanupTasks(maxAgeHours?: number) {
    const params = maxAgeHours ? `?max_age_hours=${maxAgeHours}` : '';
    return this.request(`/ingestion/tasks/cleanup${params}`, {
      method: 'POST',
    });
  }

  async getQueueStatus() {
    return this.request('/ingestion/queue-status');
  }

  // Health check
  async healthCheck() {
    return this.request<{status: string; service: string}>('/health');
  }
}

export const apiService = new ApiService();