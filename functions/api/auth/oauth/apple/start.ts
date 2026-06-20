/**
 * GET /api/auth/oauth/apple/start
 *
 * Apple Sign In ile authorize. Apple Service ID (client_id) ile authorize endpoint'e
 * yonlendirir; response_mode=form_post Apple'in talep ettigi tek mod, callback POST gelir.
 *
 * Env vars (CF Pages -> Settings -> Environment variables):
 *   APPLE_SERVICE_ID       — Apple Developer'da olusturulan Service ID (com.hanefinans.web vs.)
 *   APPLE_TEAM_ID          — 10-karakter Apple Team ID
 *   APPLE_KEY_ID           — Sign In with Apple key ID
 *   APPLE_PRIVATE_KEY      — Apple .p8 private key icerigi (PEM, BEGIN/END dahil)
 *
 * Redirect URI (Apple Service ID configuration'a kayit edilmeli):
 *   https://hanefinans.net/api/auth/oauth/apple/callback
 *
 * NEXT_SESSION.md'de Apple Developer setup adim adim aciklamasi var.
 */

import { type Env } from '../../_utils';
import { callbackUrl, makeStateCookie, makeStateToken } from '../_shared';

interface AppleEnv extends Env {
  APPLE_SERVICE_ID?: string;
}

export const onRequestGet: PagesFunction<AppleEnv> = async ({ request, env }) => {
  if (!env.APPLE_SERVICE_ID) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'oauth_not_configured',
        message: 'APPLE_SERVICE_ID env var eksik. NEXT_SESSION.md Apple Developer setup bolumune bak.',
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const state = makeStateToken();
  const redirectUri = callbackUrl(request, 'apple');

  const authUrl = new URL('https://appleid.apple.com/auth/authorize');
  authUrl.searchParams.set('client_id', env.APPLE_SERVICE_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'name email');
  authUrl.searchParams.set('response_mode', 'form_post'); // Apple gerekli
  authUrl.searchParams.set('state', state);

  return new Response(null, {
    status: 302,
    headers: {
      Location: authUrl.toString(),
      'Set-Cookie': makeStateCookie(state),
      'Cache-Control': 'no-store',
    },
  });
};
