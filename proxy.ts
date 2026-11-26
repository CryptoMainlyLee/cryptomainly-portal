import { NextRequest, NextResponse } from "next/server";

// Temporary fail-closed barrier for the Next.js 16 + Market Intelligence
// isolated cloud QA branch. Never promote this preview-only code as a
// production publishing switch.
const QA_BRANCH = "security/mi-v135-next16-integration-2026-11-25";

export function proxy(request: NextRequest) {
  const environment = process.env;
  const isQaBranch = environment.VERCEL_GIT_COMMIT_REF === QA_BRANCH;
  const isQaConfigured = environment.CM_SECURITY_QA_READ_ONLY === "true";

  if (!isQaBranch && !isQaConfigured) return NextResponse.next();

  if (!isQaBranch || !isQaConfigured || environment.VERCEL_ENV !== "preview") {
    return new NextResponse("Isolated QA configuration unavailable.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  // Including server actions, Telegram, membership, subscriptions and
  // editorial endpoints. No application mutation requests in this Preview.
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new NextResponse("This QA Preview is read-only.", {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const response = NextResponse.next();
  response.headers.set("X-CryptoMainly-QA", "read-only");
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
