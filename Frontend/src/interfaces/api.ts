export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  message?: string;
  requestId: string;
}

export interface ApiFailure extends ApiResponse<null> {
  success: false;
  data: null;
  message: string;
}

export interface ApiRouteResult<T> {
  status: number;
  data: T | null;
  message?: string;
  headers?: Record<string, string>;
}

export type RateLimitRepository = "memory" | "firestore";

export interface RateLimitState {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset: number;
}
