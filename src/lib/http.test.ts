import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { request, safeRequest, qs, HttpError } from './http';

describe('qs', () => {
  it('undefined/null/empty değerleri atar', () => {
    expect(qs({ a: 1, b: undefined, c: null, d: '', e: 'ok' })).toBe('?a=1&e=ok');
  });
  it('boş input → boş string', () => {
    expect(qs({})).toBe('');
  });
  it('boolean değerleri stringify eder', () => {
    expect(qs({ x: true, y: false })).toBe('?x=true&y=false');
  });
});

describe('request', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('200 + JSON → tipli data döner', async () => {
    (global.fetch as unknown as { mockResolvedValue: (r: unknown) => void }).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ hello: 'world' }),
    });
    const data = await request<{ hello: string }>('/api/test');
    expect(data.hello).toBe('world');
  });

  it('404 → HttpError fırlatır', async () => {
    (global.fetch as unknown as { mockResolvedValue: (r: unknown) => void }).mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => 'not found body',
      json: async () => ({}),
    });
    await expect(request('/api/missing')).rejects.toMatchObject({
      name: 'HttpError',
      status: 404,
    });
  });

  it('500 + retry sonrası başarı', async () => {
    let calls = 0;
    (global.fetch as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(
      async () => {
        calls++;
        if (calls === 1) {
          return {
            ok: false,
            status: 500,
            statusText: 'Internal',
            text: async () => 'err',
            json: async () => ({}),
          };
        }
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ ok: true }),
        };
      },
    );
    const data = await request<{ ok: boolean }>('/api/flaky', { retries: 1 });
    expect(data.ok).toBe(true);
    expect(calls).toBe(2);
  });

  it('Accept ve Content-Type otomatik eklenir', async () => {
    const captured: { headers?: Headers } = {};
    (global.fetch as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(
      async (_url: string, init: RequestInit) => {
        captured.headers = init.headers as Headers;
        return { ok: true, status: 200, statusText: 'OK', json: async () => ({}) };
      },
    );
    await request('/api', { method: 'POST', body: JSON.stringify({}) });
    expect(captured.headers!.get('Accept')).toBe('application/json');
    expect(captured.headers!.get('Content-Type')).toBe('application/json');
  });
});

describe('safeRequest', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('başarılı → { ok: true, data }', async () => {
    (global.fetch as unknown as { mockResolvedValue: (r: unknown) => void }).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ x: 1 }),
    });
    const r = await safeRequest<{ x: number }>('/');
    expect(r.ok).toBe(true);
    expect(r.data?.x).toBe(1);
    expect(r.error).toBeUndefined();
  });

  it('hata → { ok: false, error }', async () => {
    (global.fetch as unknown as { mockResolvedValue: (r: unknown) => void }).mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'NF',
      text: async () => '',
      json: async () => ({}),
    });
    const r = await safeRequest('/');
    expect(r.ok).toBe(false);
    expect(r.error).toBeInstanceOf(HttpError);
    expect((r.error as HttpError).status).toBe(404);
  });
});
