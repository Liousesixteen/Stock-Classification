import type Database from "better-sqlite3";
import { listResearchDocuments } from "@/lib/repositories/researchDocuments";
import { effectiveEvidenceSql } from "@/lib/research/evidenceTrust";

export type ResearchArtifactKind = "report" | "ai" | "snapshot" | "comparison";
export type ResearchArtifactStage = "ready" | "draft" | "needs_work";

export type ResearchArtifact = {
  id: string;
  kind: ResearchArtifactKind;
  stage: ResearchArtifactStage;
  title: string;
  summary: string;
  content: string;
  companyName: string;
  stockCode: string;
  categoryId: number | null;
  categoryName: string;
  tags: string[];
  model: string;
  version: string;
  evidenceCount: number;
  completeness: number;
  archived?: boolean;
  pinned?: boolean;
  updatedAt: string;
};

export type ResearchResultsLibrary = {
  artifacts: ResearchArtifact[];
  stats: {
    total: number;
    weekAdded: number;
    reportCount: number;
    needsWork: number;
    byKind: Record<ResearchArtifactKind, number>;
  };
};

type ReportRow = {
  id: number;
  stockCode: string;
  categoryId: number | null;
  reportType: string;
  title: string;
  executiveSummary: string;
  content: string;
  model: string;
  updatedAt: string;
  shortName: string;
  categoryName: string | null;
  evidenceCount: number;
};

type RunRow = {
  id: number;
  stockCode: string;
  categoryId: number | null;
  question: string;
  depth: string;
  model: string;
  resultJson: string;
  updatedAt: string;
  shortName: string;
  categoryName: string | null;
  evidenceCount: number;
};

type UniversalRunRow = {
  id: number;
  subjectType: "industry" | "question";
  subjectKey: string;
  subjectLabel: string;
  categoryId: number | null;
  question: string;
  depth: string;
  model: string;
  resultJson: string;
  updatedAt: string;
  categoryName: string | null;
};

type ProfileRow = {
  stockCode: string;
  shortName: string;
  industry: string;
  summary: string;
  businessLines: string;
  chainPosition: string;
  competitiveAdvantages: string;
  catalysts: string;
  risks: string;
  updatedAt: string;
  categoryId: number | null;
  categoryName: string | null;
  evidenceCount: number;
};

type CategoryRow = {
  categoryId: number;
  categoryName: string;
  industry: string;
  updatedAt: string;
  companyCount: number;
  evidenceCount: number;
  companyNames: string;
};

export function listResearchResults(db: Database.Database): ResearchResultsLibrary {
  const generated = [
    ...listResearchDocumentArtifacts(db),
    ...listReports(db),
    ...listResearchRuns(db),
    ...listUniversalResearchRuns(db),
    ...listProfileArtifacts(db),
    ...listCategoryArtifacts(db),
  ].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  const states = new Map(
    (db.prepare(
      "select artifact_id as artifactId, archived, pinned from research_artifact_states",
    ).all() as Array<{ artifactId: string; archived: number; pinned: number }>)
      .map((row) => [row.artifactId, row] as const),
  );
  const artifacts = generated.map((artifact) => {
    const state = states.get(artifact.id);
    return {
      ...artifact,
      archived: state?.archived === 1,
      pinned: state?.pinned === 1,
    };
  });

  const byKind: Record<ResearchArtifactKind, number> = { report: 0, ai: 0, snapshot: 0, comparison: 0 };
  for (const artifact of artifacts) byKind[artifact.kind] += 1;

  return {
    artifacts,
    stats: {
      total: artifacts.length,
      weekAdded: artifacts.filter((artifact) => isWithinDays(artifact.updatedAt, 7)).length,
      reportCount: byKind.report,
      needsWork: artifacts.filter((artifact) => artifact.stage !== "ready").length,
      byKind,
    },
  };
}

export function setResearchArtifactState(
  db: Database.Database,
  artifactId: string,
  state: { archived?: boolean; pinned?: boolean },
) {
  db.prepare(`
    insert into research_artifact_states (artifact_id, archived, pinned)
    values (@artifactId, @archived, @pinned)
    on conflict(artifact_id) do update set
      archived = case when @archivedProvided = 1 then excluded.archived else research_artifact_states.archived end,
      pinned = case when @pinnedProvided = 1 then excluded.pinned else research_artifact_states.pinned end,
      updated_at = current_timestamp
  `).run({
    artifactId,
    archived: state.archived ? 1 : 0,
    pinned: state.pinned ? 1 : 0,
    archivedProvided: state.archived === undefined ? 0 : 1,
    pinnedProvided: state.pinned === undefined ? 0 : 1,
  });
  return listResearchResults(db).artifacts.find((artifact) => artifact.id === artifactId) ?? null;
}

function listResearchDocumentArtifacts(db: Database.Database): ResearchArtifact[] {
  return listResearchDocuments(db).map((report) => {
    const effectiveCitations = report.citations.filter((citation) => isTraceableCitation(citation.url));
    const hasCitations = effectiveCitations.length > 0;
    return {
    id: `document-${report.id}`,
    kind: "report",
    stage: report.status === "ready" && hasCitations ? "ready" : report.status === "draft" ? "draft" : "needs_work",
    title: report.title,
    summary: report.executiveSummary || "报告摘要待完善。",
    content: report.markdown,
    companyName: report.reportType === "company" ? report.subjectLabel : "",
    stockCode: report.stockCode,
    categoryId: report.categoryId,
    categoryName: report.reportType === "industry"
      ? report.subjectLabel
      : report.reportType === "comparison"
        ? "公司对比"
        : report.reportType === "event"
          ? "事件点评"
          : "公司研究",
    tags: [reportTypeLabel(report.reportType), `V${report.currentVersion}`, report.status === "ready" ? "质检通过" : "待完善"],
    model: report.model || "AI Research",
    version: `V${report.currentVersion}`,
    evidenceCount: effectiveCitations.length,
    completeness: hasCitations ? report.quality.score : Math.min(20, report.quality.score),
    updatedAt: report.updatedAt,
    };
  });
}

function listUniversalResearchRuns(db: Database.Database): ResearchArtifact[] {
  const rows = db.prepare(
    `select run.id, run.subject_type as subjectType, run.subject_key as subjectKey,
            run.subject_label as subjectLabel, run.category_id as categoryId,
            run.question, run.depth, run.model, run.result_json as resultJson,
            run.updated_at as updatedAt, category.name as categoryName
     from universal_research_runs run
     left join categories category on category.id = run.category_id
     where run.status = 'completed'
     order by run.id desc`,
  ).all() as UniversalRunRow[];

  return rows.map((row) => {
    const result = parseJson<Record<string, unknown>>(row.resultJson, {});
    const thesis = textValue(result.thesis, "当前本地证据不足，研究结论待补。");
    const citations = Array.isArray(result.citations) ? result.citations : [];
    const risks = stringList(result.risks);
    const catalysts = stringList(result.catalysts);
    return {
      id: `universal-run-${row.id}`,
      kind: "ai",
      stage: citations.length ? "ready" : "needs_work",
      title: `${row.subjectLabel}${row.subjectType === "industry" ? "赛道" : "专题"}研判`,
      summary: thesis,
      content: [`# ${row.subjectLabel}研究`, `## 研究问题\n${row.question}`, `## 核心判断\n${thesis}`, `## 催化因素\n${asMarkdownList(catalysts)}`, `## 风险与反证\n${asMarkdownList(risks)}`].join("\n\n"),
      companyName: "",
      stockCode: "",
      categoryId: row.categoryId,
      categoryName: row.categoryName ?? (row.subjectType === "industry" ? row.subjectLabel : "开放研究"),
      tags: [row.subjectType === "industry" ? "行业研究" : "开放问题", row.depth === "deep" ? "深度研判" : "联合研判"],
      model: row.model || "AI Research",
      version: `U${row.id}`,
      evidenceCount: citations.length,
      completeness: citations.length ? clamp(20 + citations.length * 10, 20, 98) : 15,
      updatedAt: row.updatedAt,
    };
  });
}

function listReports(db: Database.Database): ResearchArtifact[] {
  const rows = db.prepare(
    `select report.id, report.stock_code as stockCode, report.category_id as categoryId,
            report.report_type as reportType, report.title, report.executive_summary as executiveSummary,
            report.content, report.model, report.updated_at as updatedAt,
            company.short_name as shortName, category.name as categoryName,
            (select count(*) from evidences evidence
             join company_category_relations relation on relation.id = evidence.relation_id
             where relation.stock_code = report.stock_code
               and (${effectiveEvidenceSql("evidence")})) as evidenceCount
     from ai_research_reports report
     join companies company on company.stock_code = report.stock_code
     left join categories category on category.id = report.category_id
     order by report.id desc`,
  ).all() as ReportRow[];

  return rows.map((row) => ({
    id: `report-${row.id}`,
    kind: "report",
    stage: row.executiveSummary.length > 40 && row.evidenceCount > 0 ? "ready" : "needs_work",
    title: row.title,
    summary: row.executiveSummary || "报告摘要待完善。",
    content: row.content,
    companyName: row.shortName,
    stockCode: row.stockCode,
    categoryId: row.categoryId,
    categoryName: row.categoryName ?? (row.reportType === "industry" ? "行业研究" : "公司研究"),
    tags: [row.reportType === "industry" ? "行业研究" : "公司深度", row.categoryName ?? "A股研究"],
    model: row.model || "AI Research",
    version: `V${Math.max(1, row.id)}.0`,
    evidenceCount: row.evidenceCount,
    completeness: row.evidenceCount > 0
      ? clamp(45 + row.evidenceCount * 8, 45, 100)
      : Math.min(20, Math.round(row.executiveSummary.length / 5)),
    updatedAt: row.updatedAt,
  }));
}

function listResearchRuns(db: Database.Database): ResearchArtifact[] {
  const rows = db.prepare(
    `select run.id, run.stock_code as stockCode, run.category_id as categoryId,
            run.question, run.depth, run.model, run.result_json as resultJson,
            run.updated_at as updatedAt, company.short_name as shortName,
            category.name as categoryName,
            (select count(*) from evidences evidence
             join company_category_relations relation on relation.id = evidence.relation_id
             where relation.stock_code = run.stock_code
               and (${effectiveEvidenceSql("evidence")})) as evidenceCount
     from ai_research_runs run
     join companies company on company.stock_code = run.stock_code
     left join categories category on category.id = run.category_id
     where run.status = 'completed'
     order by run.id desc`,
  ).all() as RunRow[];

  return rows.map((row) => {
    const result = parseJson<Record<string, unknown>>(row.resultJson, {});
    const thesis = textValue(result.thesis, "AI 团队已完成交叉研判，结论仍需结合证据复核。");
    const risks = stringList(result.risks);
    const catalysts = stringList(result.catalysts);
    const citations = Array.isArray(result.citations) ? result.citations : [];
    return {
      id: `run-${row.id}`,
      kind: "ai" as const,
      stage: citations.length ? "ready" as const : "needs_work" as const,
      title: `${row.shortName}联合研判结论`,
      summary: thesis,
      content: [`# ${row.shortName}联合研判`, "", `## 研究问题\n${row.question}`, `## 核心判断\n${thesis}`, `## 催化因素\n${asMarkdownList(catalysts)}`, `## 风险与反证\n${asMarkdownList(risks)}`].join("\n\n"),
      companyName: row.shortName,
      stockCode: row.stockCode,
      categoryId: row.categoryId,
      categoryName: row.categoryName ?? "通用研究",
      tags: [row.depth === "deep" ? "深度研判" : "联合研判", row.categoryName ?? "A股研究"],
      model: row.model || "AI Research",
      version: `R${row.id}`,
      evidenceCount: citations.length,
      completeness: citations.length ? clamp(20 + citations.length * 10, 20, 98) : 15,
      updatedAt: row.updatedAt,
    };
  });
}

function listProfileArtifacts(db: Database.Database): ResearchArtifact[] {
  const rows = db.prepare(
    `select profile.stock_code as stockCode, company.short_name as shortName,
            company.industry, profile.summary, profile.business_lines as businessLines,
            profile.chain_position as chainPosition,
            profile.competitive_advantages as competitiveAdvantages,
            profile.catalysts, profile.risks, profile.updated_at as updatedAt,
            (select relation.category_id from company_category_relations relation
             where relation.stock_code = profile.stock_code
             order by case relation.relation_type when '主营业务' then 0 when '重要相关' then 1 else 2 end, relation.id limit 1) as categoryId,
            (select category.name from categories category where category.id =
              (select relation.category_id from company_category_relations relation
               where relation.stock_code = profile.stock_code
               order by case relation.relation_type when '主营业务' then 0 when '重要相关' then 1 else 2 end, relation.id limit 1)) as categoryName,
            (select count(*) from evidences evidence
             join company_category_relations relation on relation.id = evidence.relation_id
             where relation.stock_code = profile.stock_code
               and (${effectiveEvidenceSql("evidence")})) as evidenceCount
     from company_research_profiles profile
     join companies company on company.stock_code = profile.stock_code
     order by profile.updated_at desc`,
  ).all() as ProfileRow[];

  return rows.map((row) => {
    const businessLines = stringListFromStructuredJson(row.businessLines);
    const chainPosition = stringListFromStructuredJson(row.chainPosition);
    const advantages = stringListFromStructuredJson(row.competitiveAdvantages);
    const catalysts = stringListFromStructuredJson(row.catalysts);
    const risks = stringListFromStructuredJson(row.risks);
    const filledSections = [row.summary, businessLines.join(""), chainPosition.join(""), advantages.join(""), catalysts.join(""), risks.join("")].filter(Boolean).length;
    const completeness = clamp(
      Math.round(filledSections / 6 * 60) + Math.min(40, row.evidenceCount * 10),
      0,
      100,
    );
    return {
      id: `profile-${row.stockCode}`,
      kind: "ai" as const,
      stage: completeness >= 72 ? "ready" as const : "needs_work" as const,
      title: `${row.shortName}公司研究档案`,
      summary: row.summary || `${row.shortName}的结构化公司资料已建立，核心业务与产业链位置仍待补充。`,
      content: [`# ${row.shortName}公司研究档案`, `## 公司速览\n${row.summary || "待完善"}`, `## 核心业务\n${asMarkdownList(businessLines)}`, `## 产业链位置\n${asMarkdownList(chainPosition)}`, `## 核心竞争优势\n${asMarkdownList(advantages)}`, `## 催化因素\n${asMarkdownList(catalysts)}`, `## 风险与反证\n${asMarkdownList(risks)}`].join("\n\n"),
      companyName: row.shortName,
      stockCode: row.stockCode,
      categoryId: row.categoryId,
      categoryName: row.categoryName ?? row.industry ?? "公司研究",
      tags: [row.industry || "A股公司", row.categoryName ?? "研究档案"],
      model: "Research Profile",
      version: "档案",
      evidenceCount: row.evidenceCount,
      completeness,
      updatedAt: row.updatedAt,
    };
  });
}

function listCategoryArtifacts(db: Database.Database): ResearchArtifact[] {
  const rows = db.prepare(
    `select category.id as categoryId, category.name as categoryName,
            category.industry, category.updated_at as updatedAt,
            count(distinct relation.stock_code) as companyCount,
            count(distinct evidence.id) as evidenceCount,
            group_concat(distinct company.short_name) as companyNames
     from categories category
     join company_category_relations relation on relation.category_id = category.id
     join companies company on company.stock_code = relation.stock_code
     left join evidences evidence on evidence.relation_id = relation.id and (${effectiveEvidenceSql("evidence")})
     where category.is_active = 1
       and (
         relation.is_watchlist = 1
         or exists (select 1 from company_research_profiles profile where profile.stock_code = relation.stock_code)
         or exists (
           select 1 from evidences active_evidence
           where active_evidence.relation_id = relation.id
             and (${effectiveEvidenceSql("active_evidence")})
         )
       )
     group by category.id
     having count(distinct relation.stock_code) >= 2
     order by evidenceCount desc, companyCount desc, category.id
     limit 8`,
  ).all() as CategoryRow[];

  return rows.flatMap((row, index) => {
    const companies = row.companyNames.split(",").filter(Boolean);
    const structureScore = Math.min(25, Math.round(row.companyCount / 10 * 25));
    const evidenceDensity = row.evidenceCount / Math.max(1, row.companyCount);
    const completeness = clamp(structureScore + Math.round(Math.min(1, evidenceDensity) * 75), 0, 100);
    const snapshot: ResearchArtifact = {
      id: `snapshot-${row.categoryId}`,
      kind: "snapshot",
      stage: evidenceDensity >= 0.5 ? "ready" : "needs_work",
      title: `${row.categoryName}产业链图谱快照`,
      summary: `覆盖 ${row.companyCount} 家相关公司和 ${row.evidenceCount} 条有效证据，呈现当前细分环节的公司关系与证据密度。`,
      content: [`# ${row.categoryName}产业链图谱快照`, `- 相关公司：${row.companyCount} 家`, `- 有效证据：${row.evidenceCount} 条`, `- 代表公司：${companies.slice(0, 8).join("、") || "待补"}`].join("\n"),
      companyName: "",
      stockCode: "",
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      tags: [row.industry || "产业链", "图谱快照"],
      model: "Industry Graph",
      version: "快照",
      evidenceCount: row.evidenceCount,
      completeness,
      updatedAt: row.updatedAt,
    };
    if (index > 3 || row.companyCount < 3) return [snapshot];
    const comparison: ResearchArtifact = {
      ...snapshot,
      id: `comparison-${row.categoryId}`,
      kind: "comparison",
      stage: row.evidenceCount >= 2 && evidenceDensity >= 0.5 ? "ready" : "draft",
      title: `${row.categoryName}同赛道公司对比`,
      summary: `${companies.slice(0, 4).join("、")}等 ${row.companyCount} 家公司被纳入同赛道矩阵，可继续核验业务占比、技术路线与客户结构。`,
      content: [`# ${row.categoryName}同赛道公司对比`, "", `## 对比范围\n${companies.join("、")}`, `## 当前证据\n已沉淀 ${row.evidenceCount} 条关系证据。`, "## 下一步\n补充收入结构、毛利率、客户与订单变化。"].join("\n\n"),
      tags: [row.categoryName, "同赛道对比"],
      version: "矩阵",
    };
    return [snapshot, comparison];
  });
}

function stringListFromStructuredJson(value: string) {
  const parsed = parseJson<unknown>(value, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.map((item) => {
    if (typeof item === "string") return item.trim();
    if (!item || typeof item !== "object") return "";
    const record = item as Record<string, unknown>;
    const name = textValue(record.name, textValue(record.title, textValue(record.label, "")));
    const detail = textValue(record.share, textValue(record.description, textValue(record.value, "")));
    return [name, detail].filter(Boolean).join("：");
  }).filter(Boolean);
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()) : [];
}

function textValue(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asMarkdownList(items: string[]) {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "- 待完善";
}

function reportTypeLabel(value: string) {
  if (value === "industry") return "赛道研究";
  if (value === "comparison") return "公司对比";
  if (value === "event") return "事件点评";
  return "公司深度";
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function isWithinDays(value: string, days: number) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && Date.now() - timestamp <= days * 86_400_000;
}

function isTraceableCitation(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
