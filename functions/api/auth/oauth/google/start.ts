/**
 * GET /api/auth/oauth/google/start
 *
 * Kullaniciyi Google OAuth 2.0 authorize endpoint'ine yonlendirir.
 * state CSRF token oauth_state cookie'sinde saklanir; callback'te dogrulanir.
 *
 * Env vars (CF Pages -> Settings -> Environment variables):
 *   GOOGLE_OAUTH_CLIENT_ID     — Google Cloud Console OAuth 2.0 Client ID
 *   GOOGLE_OAUTH_CLIENT_SECRET — Google Cloud Console OAuth 2.0 Client Secret
 *
 * Redirect URI (Google Console'a kayit edilmeli):
 *   https://hanefinans.net/api/auth/oauth/google/callback
 */

import { type Env } from '../../_utils';
import { callbackUrl, makeStateCookie, makeStateToken } from '../_shared';

interface GoogleEnv extends Env {
  GOOGLE_OAUTH_CLIENT_ID?: string;
}

export const onRequestGet: PagesFunction<GoogleEnv> = async ({ request, env }) => {
  if (!env.GOOGLE_OAUTH_CLIENT_ID) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'oauth_not_configured',
        message: 'GOOGLE_OAUTH_CLIENT_ID env var eksik. CF Pages Settings -> Environment variables.',
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const state = makeStateToken();
  const redirectUri = callbackUrl(request, 'google');

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', env.GOOGLE_OAUTH_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('prompt', 'select_account'); // Birden fazla Google hesabi varsa secsin
  authUrl.searchParams.set('access_type', 'online'); // Refresh token'a gerek yok

  return new Response(null, {
    status: 302,
    headers: {
      Location: authUrl.toString(),
      'Set-Cookie': makeStateCookie(state),
      'Cache-Control': 'no-store',
    },
  });
};
