/** Keep upstream compatibility details out of product-facing report content. */
export function sanitizePublicReportText(value: string): string {
  return value
    .replace(/\bfinsight:(\d+)\b/gi, "atlas-research:$1")
    .replace(/finsight/gi, "星图研报引擎");
}

export function sanitizePublicFacingPayload<T>(value: T, field = ""): T {
  if (typeof value === "string") {
    if (/^(?:url|path|engine)$/i.test(field) || /(?:url|path)$/i.test(field)) return value;
    return sanitizePublicReportText(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizePublicFacingPayload(item, field)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizePublicFacingPayload(item, key)]),
    ) as T;
  }
  return value;
}
