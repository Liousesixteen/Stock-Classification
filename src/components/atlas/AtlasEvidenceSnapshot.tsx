"use client";

import { ExternalLink, FileCheck2, X } from "lucide-react";
import type { IndustryGraphNode } from "@/lib/industry-graph/types";
import { safeExternalUrl } from "@/lib/security/urls";
import { evidenceTrustLabel } from "@/lib/research/evidenceTrust";

type EvidenceNode = Extract<IndustryGraphNode, { kind: "evidence" }>;

export function AtlasEvidenceSnapshot({ evidence, onClose }: { evidence: EvidenceNode; onClose: () => void }) {
  const sourceUrl = safeExternalUrl(evidence.url);
  return (
    <aside className="atlas-company-snapshot atlas-evidence-snapshot" data-testid="atlas-evidence-snapshot">
      <div className="atlas-snapshot-head">
        <div>
          <div className="atlas-kicker">EVIDENCE NODE · {evidence.evidenceScope === "category" ? "分类关系" : "外部实体"}</div>
          <h2>{evidence.label}</h2>
        </div>
        <div className="atlas-snapshot-actions">
          <FileCheck2 aria-hidden="true" />
          <button type="button" aria-label="关闭证据快照" onClick={onClose}><X aria-hidden="true" /></button>
        </div>
      </div>
      <p className="atlas-meta">{evidence.sourceType} · {evidence.sourceDate || "时间待补"} · {evidence.credibility}可信度 · {evidenceTrustLabel(evidence.verificationStatus === "verified" ? "verified" : sourceUrl ? "source_backed" : "unverified")}</p>
      <section>
        <span>证据摘录</span>
        <p>{evidence.excerpt || "尚未保存原文摘录，请通过来源链接核验。"}</p>
      </section>
      <div className="atlas-metrics">
        <div><b>{evidence.sourceType}</b><span>来源类型</span></div>
        <div><b>{evidence.credibility}</b><span>可信度</span></div>
        <div><b>{evidence.sourceDate || "待补"}</b><span>证据日期</span></div>
      </div>
      {sourceUrl ? (
        <a className="atlas-evidence-source" href={sourceUrl} target="_blank" rel="noreferrer">
          查看原文 <ExternalLink aria-hidden="true" />
        </a>
      ) : <p className="atlas-evidence-missing">原文链接待补</p>}
    </aside>
  );
}
