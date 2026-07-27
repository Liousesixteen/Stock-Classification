import { safeEqual } from "@/lib/security/requestPolicy";

export function isOperationsRequestAuthorized(request: Request) {
  const expected = process.env.STOCK_OPERATIONS_TOKEN?.trim() ?? "";
  if (!expected) return process.env.NODE_ENV !== "production";
  const authorization = request.headers.get("authorization");
  const bearer = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const headerToken = request.headers.get("x-operations-token")?.trim() ?? "";
  return safeEqual(bearer || headerToken, expected);
}
