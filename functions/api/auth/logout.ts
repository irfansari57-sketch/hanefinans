/**
 * POST /api/auth/logout
 * Session cookie'sini siler.
 */

import { clearSessionCookie, jsonResponse } from './_utils';

export const onRequestPost: PagesFunction = async () => {
  return jsonResponse({ ok: true }, 200, {
    'Set-Cookie': clearSessionCookie(),
  });
};
