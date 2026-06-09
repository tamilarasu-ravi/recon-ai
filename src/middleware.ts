import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

import { isApiAuthRequired } from "@/lib/config/runtime";
import { isSsoEnabled } from "@/lib/auth/sso-config";

const isPublicRoute = createRouteMatcher([
  "/api/health",
  "/api/ready",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
  "/api/cron(.*)",
  "/api/erp/callback(.*)",
]);

const clerkProtectedMiddleware = clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) {
    return;
  }

  await auth.protect();
});

/**
 * Runs Clerk protection when API auth is required and SSO is configured; otherwise passes through.
 *
 * @param request - Incoming Next.js request.
 * @param event - Middleware fetch event.
 * @returns Middleware response.
 */
export default function middleware(
  request: NextRequest,
  event: NextFetchEvent,
): ReturnType<typeof clerkProtectedMiddleware> {
  if (!isApiAuthRequired() || !isSsoEnabled()) {
    return NextResponse.next();
  }

  return clerkProtectedMiddleware(request, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
