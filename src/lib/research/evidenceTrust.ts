export type EvidenceVerificationStatus = "unverified" | "verified" | "conflicted" | "rejected";

export type EvidenceTrustLevel =
  | "verified"
  | "source_backed"
  | "unverified"
  | "conflicted"
  | "rejected"
  | "expired";

export type EvidenceTrustInput = {
  isExpired?: boolean | number | null;
  verificationStatus?: EvidenceVerificationStatus | string | null;
  url?: string | null;
};

export function getEvidenceTrustLevel(evidence: EvidenceTrustInput): EvidenceTrustLevel {
  if (evidence.isExpired === true || evidence.isExpired === 1) return "expired";
  if (evidence.verificationStatus === "rejected") return "rejected";
  if (evidence.verificationStatus === "conflicted") return "conflicted";
  if (evidence.verificationStatus === "verified") return "verified";
  return hasTraceableSourceUrl(evidence.url) ? "source_backed" : "unverified";
}

export function isEffectiveEvidence(evidence: EvidenceTrustInput) {
  const level = getEvidenceTrustLevel(evidence);
  return level === "verified" || level === "source_backed";
}

export function hasTraceableSourceUrl(value: string | null | undefined) {
  if (!value?.trim()) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * SQL equivalent of isEffectiveEvidence for trusted, internal aliases.
 * A candidate source is effective when it is explicitly verified, or when it
 * carries a traceable HTTP(S) source URL. Expired/conflicted/rejected rows never
 * count as effective.
 */
export function effectiveEvidenceSql(alias: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(alias)) {
    throw new Error("证据 SQL 别名无效");
  }
  return `
    ${alias}.is_expired = 0
    and ${alias}.verification_status not in ('conflicted', 'rejected')
    and (
      ${alias}.verification_status = 'verified'
      or lower(trim(${alias}.url)) like 'http://%'
      or lower(trim(${alias}.url)) like 'https://%'
    )
  `;
}

export function evidenceTrustLabel(level: EvidenceTrustLevel) {
  if (level === "verified") return "已核验";
  if (level === "source_backed") return "来源可用";
  if (level === "conflicted") return "存在冲突";
  if (level === "rejected") return "已驳回";
  if (level === "expired") return "已过期";
  return "待核验";
}
