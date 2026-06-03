import { NextResponse } from "next/server";

import { getDb } from "@/lib/db/client";
import { upsertQuickBooksConnection } from "@/lib/integrations/erp/erp-connections";
import {
  exchangeQuickBooksAuthCode,
  getQuickBooksConfig,
} from "@/lib/integrations/erp/quickbooks/config";
import { verifyQuickBooksOAuthState } from "@/lib/integrations/erp/quickbooks/oauth-state";

export const dynamic = "force-dynamic";

/**
 * OAuth callback from Intuit — exchanges code and stores tenant tokens.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const settingsUrl = new URL("/settings", request.url);

  try {
    const config = getQuickBooksConfig();
    if (!config) {
      settingsUrl.searchParams.set("qb_error", "not_configured");
      return NextResponse.redirect(settingsUrl);
    }

    const url = new URL(request.url);
    const errorParam = url.searchParams.get("error");
    if (errorParam) {
      settingsUrl.searchParams.set("qb_error", errorParam);
      return NextResponse.redirect(settingsUrl);
    }

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const realmId = url.searchParams.get("realmId") ?? undefined;

    if (!code || !state) {
      settingsUrl.searchParams.set("qb_error", "missing_code");
      return NextResponse.redirect(settingsUrl);
    }

    const payload = verifyQuickBooksOAuthState(state, config.clientSecret);
    const tokens = await exchangeQuickBooksAuthCode(config, code);

    const db = getDb();
    await upsertQuickBooksConnection(db, payload.tenantId, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresInSec: tokens.expires_in,
      realmId,
    });

    settingsUrl.searchParams.set("qb", "connected");
    return NextResponse.redirect(settingsUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "oauth_failed";
    console.error("[quickbooks-oauth] callback failed:", message);
    settingsUrl.searchParams.set("qb_error", message.slice(0, 200));
    return NextResponse.redirect(settingsUrl);
  }
}
