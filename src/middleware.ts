import { NextResponse, type NextRequest } from "next/server";
import {
  consumeRateLimit,
  getMaxRequestBytes,
  getRateLimitPolicy,
  parseBasicAuthorization,
  safeEqual,
  type RateLimitEntry,
} from "@/lib/security/requestPolicy";

const rateLimitStore = new Map<string, RateLimitEntry>();
let requestCount = 0;

export function middleware(request: NextRequest) {
  const requestId = request.headers.get("x-request-id")?.slice(0, 96) || crypto.randomUUID();
  const authFailure = authorize(request);
  if (authFailure) return withSecurityHeaders(authFailure, requestId, request.nextUrl.pathname);

  if (request.nextUrl.pathname.startsWith("/api/")) {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    const maxRequestBytes = getMaxRequestBytes(request.nextUrl.pathname);
    if (Number.isFinite(contentLength) && contentLength > maxRequestBytes) {
      return withSecurityHeaders(NextResponse.json(
        { error: "请求正文超过允许大小", requestId },
        { status: 413 },
      ), requestId, request.nextUrl.pathname);
    }
    const policy = getRateLimitPolicy(request.nextUrl.pathname, request.method);
    const client = clientIdentifier(request);
    const result = consumeRateLimit(rateLimitStore, `${client}:${policy.bucket}`, policy);
    pruneRateLimits();
    if (!result.allowed) {
      return withSecurityHeaders(NextResponse.json(
        { error: "请求过于频繁，请稍后重试", requestId },
        {
          status: 429,
          headers: {
            "Retry-After": String(result.retryAfterSeconds),
            "X-RateLimit-Limit": String(result.limit),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1_000)),
          },
        },
      ), requestId, request.nextUrl.pathname);
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  const username = configuredUsername();
  if (username) requestHeaders.set("x-authenticated-user", username);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  return withSecurityHeaders(response, requestId, request.nextUrl.pathname);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};

function authorize(request: NextRequest) {
  if (request.nextUrl.pathname === "/api/health") return null;
  const username = configuredUsername();
  const password = process.env.STOCK_APP_BASIC_AUTH_PASSWORD?.trim() ?? "";
  if (!username && !password) return null;
  if (!username || !password) {
    return NextResponse.json({ error: "访问控制配置不完整" }, { status: 503 });
  }
  const credentials = parseBasicAuthorization(request.headers.get("authorization"));
  if (credentials && safeEqual(credentials.username, username) && safeEqual(credentials.password, password)) return null;
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Stock Research Workspace", charset="UTF-8"' },
  });
}

function configuredUsername() {
  return process.env.STOCK_APP_BASIC_AUTH_USER?.trim() ?? "";
}

function clientIdentifier(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "local";
}

function pruneRateLimits() {
  requestCount += 1;
  if (requestCount % 500 !== 0) return;
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (entry.resetAt <= now) rateLimitStore.delete(key);
  }
}

function withSecurityHeaders(response: NextResponse, requestId: string, pathname: string) {
  const richWorkbench = pathname === "/rich-workbench" || pathname.startsWith("/rich-workbench/");
  response.headers.set("X-Request-Id", requestId);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", richWorkbench ? "SAMEORIGIN" : "DENY");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  const developmentEval = process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'";
  response.headers.set(
    "Content-Security-Policy",
    `default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors ${richWorkbench ? "'self'" : "'none'"}; frame-src 'self'; object-src 'none'; script-src 'self' 'unsafe-inline'${developmentEval}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'`,
  );
  if (process.env.NODE_ENV === "production" && process.env.STOCK_FORCE_HTTPS === "true") {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  return response;
}
