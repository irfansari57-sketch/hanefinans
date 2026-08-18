import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserTier } from '@/data/db';
import { FEATURES } from '@/lib/featureFlags';

/**
 * Cloud auth — Cloudflare D1 + Pages Functions + JWT HttpOnly cookie.
 *
 * Kullanıcı verisi server-side D1'de tutulur; tüm tarayıcılar/cihazlar
 * aynı merkezi tabloyu görür. Admin paneli tüm kullanıcıları listeleyebilir.
 *
 * Session: JWT HttpOnly cookie (fa_session) — JS'ten okunamaz, XSS güvenli.
 * Frontend sadece public user info'yu localStorage'a cache eder (snappy UI).
 *
 * Mount'ta `refresh()` çağrılır — cookie geçerli mi diye server'a sorar.
 */

export interface SessionUser {
  id: number;
  email: string;
  name?: string;
  tier: UserTier;
  tierExpiresAt?: number;
  avatarColor: string;
  emailVerified: boolean;
  emailVerifiedAt?: number;
  /** Server-side hesaplanır (DB.is_admin || email fallback). */
  isAdmin?: boolean;
  createdAt: number;
  lastLoginAt?: number;
}

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  lastError: string | null;
  signup: (input: { email: string; password: string; name?: string; turnstileToken?: string }) => Promise<{ ok: boolean; error?: string }>;
  login: (input: { email: string; password: string; turnstileToken?: string }) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  upgradeTier: (tier: UserTier, durationMonths?: number) => Promise<void>;
  markEmailVerified: () => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Güvenlik (#Ö15): Hardcoded admin email listesi frontend bundle'ından kaldırıldı.
 * Phishing/credential-stuffing saldırganlarına hedef listesi sağlıyordu.
 * Tek truth source artık server'dan gelen `user.isAdmin` flag'i.
 */

async function apiPost<T>(path: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const r = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin', // cookie gönderilsin
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json() as T & { ok: boolean; error?: string };
    if (!j.ok) return { ok: false, error: j.error ?? `HTTP ${r.status}` };
    return { ok: true, data: j };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function apiGet<T>(path: string): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const r = await fetch(path, { credentials: 'same-origin' });
    const j = await r.json() as T & { ok: boolean; error?: string };
    if (!j.ok) return { ok: false, error: j.error ?? `HTTP ${r.status}` };
    return { ok: true, data: j };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      loading: false,
      lastError: null,

      signup: async ({ email, password, name, turnstileToken }) => {
        set({ loading: true, lastError: null });
        const r = await apiPost<{ user: SessionUser }>('/api/auth/signup', { email, password, name, turnstileToken });
        set({ loading: false });
        if (!r.ok) {
          set({ lastError: r.error });
          return { ok: false, error: r.error };
        }
        set({ user: r.data.user });
        return { ok: true };
      },

      login: async ({ email, password, turnstileToken }) => {
        set({ loading: true, lastError: null });
        const r = await apiPost<{ user: SessionUser }>('/api/auth/login', { email, password, turnstileToken });
        set({ loading: false });
        if (!r.ok) {
          set({ lastError: r.error });
          return { ok: false, error: r.error };
        }
        set({ user: r.data.user });
        return { ok: true };
      },

      logout: async () => {
        await apiPost('/api/auth/logout', {}).catch(() => null);
        set({ user: null, lastError: null });
      },

      upgradeTier: async (tier, durationMonths = 1) => {
        const u = get().user;
        if (!u) return;
        // Tek truth source: server-side `user.isAdmin` flag (#Ö15).
        const isAdminUser = u.isAdmin === true;
        if (!isAdminUser && (tier === 'pro' || tier === 'elite')) {
          set({ lastError: 'Ödeme altyapısı çok yakında devreye giriyor. PRO/ELITE üyelik geçişi şu an devre dışı.' });
          return;
        }
        const expires = tier === 'free' ? null : Date.now() + durationMonths * 30 * 24 * 3600 * 1000;
        const r = await apiPost<{ user: SessionUser }>('/api/auth/update-user', {
          userId: u.id,
          tier,
          tierExpiresAt: expires,
        });
        if (r.ok) set({ user: r.data.user });
        else set({ lastError: r.error });
      },

      markEmailVerified: async () => {
        const u = get().user;
        if (!u) return;
        const r = await apiPost<{ user: SessionUser }>('/api/auth/update-user', {
          userId: u.id,
          emailVerified: true,
        });
        if (r.ok) set({ user: r.data.user });
      },

      refresh: async () => {
        const r = await apiGet<{ user: SessionUser | null }>('/api/auth/me');
        if (r.ok) {
          set({ user: r.data.user });
        } else {
          // Network hatası — mevcut cache'lenmiş user'a dokunma
        }
      },
    }),
    {
      name: 'fa.auth.session.v2', // v1 mock auth idi — temizleyen yeni key
      partialize: (s) => ({ user: s.user }),
    },
  ),
);

// Kolay yardımcılar
export const isPro = (user: SessionUser | null): boolean => {
  if (!user) return false;
  // Paywall kapaliyken: giris yapmis TUM kullanicilar PRO sayilir (feature flag).
  if (!FEATURES.paywallEnabled) return true;
  if (user.tier === 'free') return false;
  if (user.tierExpiresAt && user.tierExpiresAt < Date.now()) return false;
  return true;
};

export const isElite = (user: SessionUser | null): boolean => {
  if (!user) return false;
  // Paywall kapaliyken: giris yapmis TUM kullanicilar Elite sayilir (feature flag).
  if (!FEATURES.paywallEnabled) return true;
  if (user.tier !== 'elite') return false;
  if (user.tierExpiresAt && user.tierExpiresAt < Date.now()) return false;
  return true;
};

export const isAdmin = (user: SessionUser | null): boolean => {
  if (!user) return false;
  // Tek truth source: server flag (#Ö15). Eski cache → false; refresh ile düzelir.
  return user.isAdmin === true;
};

export const isEmailVerified = (user: SessionUser | null): boolean => {
  if (!user) return false;
  return user.emailVerified === true;
};
