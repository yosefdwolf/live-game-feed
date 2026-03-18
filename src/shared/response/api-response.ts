import { config } from '../../config';

interface ApiMeta {
  timestamp: string;
  version: string;
  requestId?: string;
}

interface SuccessResponse<T> {
  success: true;
  data: T;
  error: null;
  meta: ApiMeta;
}

interface ErrorResponse {
  success: false;
  data: null;
  error: {
    code: string;
    message: string;
  };
  meta: ApiMeta;
}

function buildMeta(requestId?: string): ApiMeta {
  return {
    timestamp: new Date().toISOString(),
    version: config.API_VERSION,
    ...(requestId ? { requestId } : {}),
  };
}

/**
 * Wrap a successful response payload in the standard envelope.
 */
export function successResponse<T>(data: T, requestId?: string): SuccessResponse<T> {
  return {
    success: true,
    data,
    error: null,
    meta: buildMeta(requestId),
  };
}

/**
 * Wrap an error in the standard envelope.
 * Never include internal details — sanitize before calling this.
 */
export function errorResponse(code: string, message: string, requestId?: string): ErrorResponse {
  return {
    success: false,
    data: null,
    error: { code, message },
    meta: buildMeta(requestId),
  };
}
