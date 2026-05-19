/**
 * GET /api/auth/me
 * Mevcut session'dan kullanıcı bilgisini döner.
 * Frontend mount'ta çağırır — login durumunu sync eder.
 */

import { type Env, getAuthedUser, publicUser, jsonResponse } from './_utils';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.AUTH_TOKEN_SECRET) return jsonResponse({ ok: false, error: 'AUTH_TOKEN_SECRET env eksik' }, 503);
  if (!env.DB) return jsonResponse({ ok: false, error: 'D1 binding eksik' }, 503);

  const auth = await getAuthedUser(request, env);
  if (!auth) return jsonResponse({ ok: true, user: null });

  return jsonResponse({ ok: true, user: publicUser(auth.user) });
};
