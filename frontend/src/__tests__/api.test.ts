import { describe, it, expect, beforeEach } from 'vitest';
import type { InternalAxiosRequestConfig } from 'axios';
import api from '../lib/api';

describe('api client', () => {
  it('has baseURL set to /api', () => {
    expect(api.defaults.baseURL).toBe('/api');
  });

  it('sends credentials with requests', () => {
    expect(api.defaults.withCredentials).toBe(true);
  });

  it('sets Content-Type to application/json', () => {
    expect(api.defaults.headers['Content-Type']).toBe('application/json');
  });

  it('attaches CSRF token from cookie to requests', () => {
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: 'csrftoken=test-csrf-token-123',
    });

    // Access the first request interceptor handler
    const handlers = api.interceptors.request as unknown as {
      handlers: Array<{
        fulfilled: (
          config: InternalAxiosRequestConfig,
        ) => InternalAxiosRequestConfig;
      }>;
    };
    const config = {
      headers: {},
    } as InternalAxiosRequestConfig;
    const result = handlers.handlers[0].fulfilled(config);
    expect(result.headers['X-CSRFToken']).toBe('test-csrf-token-123');
  });

  beforeEach(() => {
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: '',
    });
  });
});
