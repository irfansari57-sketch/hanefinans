import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { db } from '@/data/db';
import type { UserAccount, UserTier } from '@/data/db';

/**
 * MOCK AUTH — sadece UI/UX iskeleti. Gerçek güvenlik için Supabase Auth / Firebase'e
 * geçilmelidir. Şu an şifre basit hash'le (SHA-256 over salted email+pw) saklanır;
 * client-side olduğu için brute-force'a açık ve plain-text trafik vardır.
 */

interface SessionUser {
  id: number;
  email: string;
  name?: string;
  tier: UserTier;
  tierExpiresAt?: number;
  avatarColor: string;
}

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  /** Form ve hatalar için son durum mesajı */
  lastError: string | null;
  signup: (input: { email: string; password: string; name?: string }) => Promise<{ ok: boolean; error?: string }>;
  login: (input: { email: string; password: string }) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  upgradeTier: (tier: UserTier, durationMonths?: number) => Promise<void>;
  refresh: () => Promise<void>;
}

async function hash(text: string): Promise<string> {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function randomColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  return `hsl(${hue}, 65%, 55%)`;
}

function toSession(u: UserAccount): SessionUser {
  return {
    id: u.id!,
    email: u.email,
    name: u.name,
    tier: u.tier,
    tierExpiresAt: u.tierExpiresAt,
    avatarColor: u.avatarColor ?? randomColor(u.email),
  };
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      loading: false,
      lastError: null,

      signup: async ({ email, password, name }) => {
        set({ loading: true, lastError: null });
        try {
          const normalizedEmail = email.trim().toLowerCase();
          if (!normalizedEmail.includes('@')) {
            const err = 'Geçerli bir e-posta gir';
            set({ lastError: err, loading: false });
            return { ok: false, error: err };
          }
          if (password.length < 6) {
            const err = 'Şifre en az 6 karakter olmalı';
            set({ lastError: err, loading: false });
            return { ok: false, error: err };
          }
          const existing = await db.users.where('email').equals(normalizedEmail).first();
          if (existing) {
            const err = 'Bu e-posta zaten kayıtlı. Giriş yap.';
            set({ lastError: err, loading: false });
            return { ok: false, error: err };
          }
          const passwordHash = await hash(`${normalizedEmail}::${password}::hane-finans`);
          const now = Date.now();
          const id = await db.users.add({
            email: normalizedEmail,
            name: name?.trim() || undefined,
            passwordHash,
            tier: 'free',
            createdAt: now,
            lastLoginAt: now,
            avatarColor: randomColor(normalizedEmail),
          });
          const account = await db.users.get(id);
          if (!account) throw new Error('Kayıt sonrası okuma başarısız');
          set({ user: toSession(account), loading: false });
          return { ok: true };
        } catch (e) {
          const err = (e as Error).message;
          set({ lastError: err, loading: false });
          return { ok: false, error: err };
        }
      },

      login: async ({ email, password }) => {
        set({ loading: true, lastError: null });
        try {
          const normalizedEmail = email.trim().toLowerCase();
          const account = await db.users.where('email').equals(normalizedEmail).first();
          if (!account) {
            const err = 'Bu e-posta ile kayıt yok';
            set({ lastError: err, loading: false });
            return { ok: false, error: err };
          }
          const passwordHash = await hash(`${normalizedEmail}::${password}::hane-finans`);
          if (passwordHash !== account.passwordHash) {
            const err = 'Şifre yanlış';
            set({ lastError: err, loading: false });
            return { ok: false, error: err };
          }
          await db.users.update(account.id!, { lastLoginAt: Date.now() });
          const refreshed = await db.users.get(account.id!);
          set({ user: toSession(refreshed!), loading: false });
          return { ok: true };
        } catch (e) {
          const err = (e as Error).message;
          set({ lastError: err, loading: false });
          return { ok: false, error: err };
        }
      },

      logout: () => {
        set({ user: null, lastError: null });
      },

      upgradeTier: async (tier, durationMonths = 1) => {
        const u = get().user;
        if (!u) return;
        const expires = Date.now() + durationMonths * 30 * 24 * 3600 * 1000;
        await db.users.update(u.id, { tier, tierExpiresAt: tier === 'free' ? undefined : expires });
        const updated = await db.users.get(u.id);
        if (updated) set({ user: toSession(updated) });
      },

      refresh: async () => {
        const u = get().user;
        if (!u) return;
        const fresh = await db.users.get(u.id);
        if (fresh) set({ user: toSession(fresh) });
      },
    }),
    {
      name: 'fa.auth.session.v1',
      partialize: (s) => ({ user: s.user }),
    },
  ),
);

// Kolay yardımcılar
export const isPro = (user: SessionUser | null): boolean => {
  if (!user) return false;
  if (user.tier === 'free') return false;
  if (user.tierExpiresAt && user.tierExpiresAt < Date.now()) return false;
  return true;
};

export const isElite = (user: SessionUser | null): boolean => {
  if (!user) return false;
  if (user.tier !== 'elite') return false;
  if (user.tierExpiresAt && user.tierExpiresAt < Date.now()) return false;
  return true;
};

const ADMIN_EMAILS = ['irfansari57@gmail.com', 'haneassistance@gmail.com'];

export const isAdmin = (user: SessionUser | null): boolean => {
  if (!user) return false;
  return ADMIN_EMAILS.includes(user.email.toLowerCase());
};
