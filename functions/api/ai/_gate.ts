/**
 * AI erişim gate'i — normal kullanıcılar için AI endpoint'lerini kapatıp
 * sadece admin (server-side isAdmin=true) kullanabilir hale getirir.
 *
 * PAYWALL/AI durumu frontend FEATURES.aiForAllUsers ile senkron.
 * Değişiklik için: bu dosyadaki AI_FOR_ALL_USERS flag'ini true yap + redeploy.
 *
 * Kullanım:
 *   const auth = await getAuthedUser(request, env);
 *   const gate = checkAiGate(auth);
 *   if (!gate.allowed) return jsonResponse({ ok: false, ...gate.errorBody }, 403);
 */

import { isAdminUser } from '../auth/_utils';

// getAuthedUser dönüş tipiyle uyumlu — { payload, user } yapısı.
type AuthedUser = NonNullable<Awaited<ReturnType<typeof import('../auth/_utils').getAuthedUser>>>;

// Frontend FEATURES.aiForAllUsers ile aynı — değişiklik yaparken ikisi de güncellenmeli.
const AI_FOR_ALL_USERS = false;

interface GateOk {
  allowed: true;
}
interface GateBlocked {
  allowed: false;
  errorBody: {
    error: string;
    code: 'AI_DISABLED_FOR_USERS' | 'AI_AUTH_REQUIRED';
  };
}

export function checkAiGate(auth: AuthedUser | null): GateOk | GateBlocked {
  // Herkese açık ise sadece login şartı
  if (AI_FOR_ALL_USERS) {
    if (!auth) {
      return {
        allowed: false,
        errorBody: {
          error: 'AI kullanmak için giriş yapmalısın.',
          code: 'AI_AUTH_REQUIRED',
        },
      };
    }
    return { allowed: true };
  }

  // Kapalı ise sadece admin
  if (!auth) {
    return {
      allowed: false,
      errorBody: {
        error: 'AI sorgulama şu an bakım modunda. Kısa süre içinde tekrar açılacak.',
        code: 'AI_DISABLED_FOR_USERS',
      },
    };
  }
  if (!isAdminUser(auth.user)) {
    return {
      allowed: false,
      errorBody: {
        error: 'AI sorgulama şu an bakım modunda. Kısa süre içinde tekrar açılacak.',
        code: 'AI_DISABLED_FOR_USERS',
      },
    };
  }
  return { allowed: true };
}
