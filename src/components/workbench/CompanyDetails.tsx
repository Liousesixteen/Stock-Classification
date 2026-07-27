"use client";

import {
  ArrowRight,
  BarChart3,
  Bot,
  Building2,
  Check,
  ChevronRight,
  CircleAlert,
  Database,
  FileText,
  Gauge,
  GitCompareArrows,
  Landmark,
  Layers3,
  Link2,
  MessageSquare,
  MoreHorizontal,
  PackageSearch,
  Pencil,
  PieChart,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Waypoints,
  X,
} from "lucide-react";
import * as React from "react";
import { type CSSProperties, type FormEvent, type ReactNode } from "react";
import { useEffect, useState } from "react";
import type { Company } from "@/lib/domain/types";
import type { CompanyDossierQuality } from "@/lib/research/companyDossierQuality";
import type { CompanyEvidenceTimelineItem } from "@/lib/research/companyEvidenceTimeline";
import { buildCompanyResearchDetail } from "@/lib/research/detailView";
import type { CompanyFieldFact } from "@/lib/repositories/companyFieldFacts";
import type { CompanyResearchProfile } from "@/lib/repositories/researchProfiles";
import type { CompanyGraphEntityRelation } from "@/lib/repositories/graphEntities";
import type { StoredResearchRun } from "@/lib/repositories/aiResearch";
import { safeExternalUrl } from "@/lib/security/urls";
import { CompanyGraphRelationsCard } from "./CompanyGraphRelationsCard";
import { enqueueCompanyProfileSync, pollCompanyProfileSync } from "./companySyncClient";
import type { SyncTask } from "@/lib/repositories/syncTasks";
import type { BackgroundSyncStatus } from "./types";

type CompanyRelation = {
  id: number;
  categoryId: number;
  categoryName: string;
  relationType: string;
  confidence: string;
  rationale: string;
  isWatchlist: boolean;
};

type EvidenceRow = {
  id: number;
  sourceType: string;
  title: string;
  sourceDate: string;
  url: string;
  excerpt: string;
  credibility: string;
  isExpired: boolean;
};

type CompanyDetailResponse = {
  company: Company;
  relations: CompanyRelation[];
  evidenceByRelationId: Record<string, EvidenceRow[]>;
  researchProfile: CompanyResearchProfile | null;
  latestSyncTask: SyncTask | null;
  syncTasks: SyncTask[];
  notes: Array<{ id: number; noteType: string; content: string }>;
  graphEntityRelations: CompanyGraphEntityRelation[];
  latestResearchRun: StoredResearchRun | null;
  sourceSnapshots?: Array<{
    provider: string;
    providerLabel?: string;
    status: string;
    error: string;
    fetchedAt: string;
    durationMs?: number;
  }>;
  fieldFacts?: CompanyFieldFact[];
  quality?: CompanyDossierQuality;
  evidenceTimeline?: CompanyEvidenceTimelineItem[];
};

type CompanySourceSnapshot = NonNullable<CompanyDetailResponse["sourceSnapshots"]>[number];
type CompanyDetailLoadStatus = "idle" | "loading" | "error" | "ready";

type CompanyDetailsProps = {
  stockCode: string | null;
  selectedCategoryId: number | null;
  backgroundSyncStatus?: BackgroundSyncStatus;
  onChanged: () => void;
  refreshKey: number;
  onOpenAi?: () => void;
  onOpenReport?: () => void;
  onOpenAtlas?: () => void;
  onOpenSector?: () => void;
  focusSectionId?: string;
};

type CompanyDraft = {
  shortName: string;
  fullName: string;
  board: string;
  industry: string;
  region: string;
  marketCapBand: string;
  intro: string;
  mainBusiness: string;
};

type ResearchProfileDraft = {
  summary: string;
  businessLinesText: string;
  chainPositionText: string;
  competitiveAdvantagesText: string;
  keyCustomersText: string;
  catalystsText: string;
  risksText: string;
  sourceSummary: string;
};

function draftFromCompany(company: Company): CompanyDraft {
  return {
    shortName: company.shortName,
    fullName: company.fullName,
    board: company.board,
    industry: company.industry,
    region: company.region,
    marketCapBand: company.marketCapBand,
    intro: company.intro,
    mainBusiness: company.mainBusiness,
  };
}

function researchDraftFromTemplate(
  company: Company,
  relations: CompanyRelation[],
  researchProfile: CompanyResearchProfile | null,
): ResearchProfileDraft {
  const template = buildIndustryTemplate(company, relations, researchProfile);
  return {
    summary: researchProfile?.summary || company.intro || `${company.shortName}核心资料待补。`,
    businessLinesText: formatBusinessLines(template.businessLines),
    chainPositionText: pickTemplateLines(researchProfile?.chainPosition, template.position).join("\n"),
    competitiveAdvantagesText: pickTemplateLines(researchProfile?.competitiveAdvantages, template.advantages).join("\n"),
    keyCustomersText: pickTemplateLines(researchProfile?.keyCustomers, template.customers).join("\n"),
    catalystsText: pickTemplateLines(researchProfile?.catalysts, ["催化因素待补"]).join("\n"),
    risksText: pickTemplateLines(researchProfile?.risks, ["风险因素待补"]).join("\n"),
    sourceSummary: researchProfile?.sourceSummary || "本地基础资料 + 分类关系 + Agent 整理",
  };
}

export function CompanyDetails({
  stockCode,
  selectedCategoryId,
  backgroundSyncStatus,
  onChanged,
  refreshKey,
  onOpenAi,
  onOpenReport,
  onOpenAtlas,
  onOpenSector,
  focusSectionId,
}: CompanyDetailsProps) {
  const [data, setData] = useState<CompanyDetailResponse | null>(null);
  const [loadStatus, setLoadStatus] = useState<CompanyDetailLoadStatus>("idle");
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingResearchProfile, setIsEditingResearchProfile] = useState(false);
  const [draft, setDraft] = useState<CompanyDraft | null>(null);
  const [researchDraft, setResearchDraft] = useState<ResearchProfileDraft | null>(null);
  const [formError, setFormError] = useState("");
  const [researchFormError, setResearchFormError] = useState("");
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteError, setNoteError] = useState("");
  const [syncingRelationId, setSyncingRelationId] = useState<number | null>(null);
  const [syncError, setSyncError] = useState("");

  useEffect(() => {
    if (!data || !focusSectionId) return;
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(focusSectionId);
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.classList.add("is-task-focus");
      window.setTimeout(() => target.classList.remove("is-task-focus"), 2400);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [data, focusSectionId]);

  useEffect(() => {
    if (!stockCode) {
      setData(null);
      setLoadStatus("idle");
      setLoadError("");
      setIsEditing(false);
      setIsEditingResearchProfile(false);
      setDraft(null);
      setResearchDraft(null);
      setIsEditingNote(false);
      setNoteDraft("");
      return;
    }

    setData(null);
    setLoadError("");
    setIsEditing(false);
    setIsEditingResearchProfile(false);
    setDraft(null);
    setResearchDraft(null);
    setResearchFormError("");
    setIsEditingNote(false);
    setNoteDraft("");
    setNoteError("");
  }, [stockCode]);

  useEffect(() => {
    if (!stockCode) return;

    const controller = new AbortController();
    setLoadStatus("loading");
    setLoadError("");

    const loadCompanyDetails = async () => {
      try {
        const response = await fetch(`/api/companies/${stockCode}`, { signal: controller.signal });
        const payload = await response.json().catch(() => null) as unknown;
        if (!response.ok) {
          throw new Error(companyDetailResponseError(payload, response.status));
        }
        if (!isCompanyDetailResponse(payload)) {
          throw new Error("公司详情数据格式无效，请重新加载。");
        }
        if (controller.signal.aborted) return;
        setData(payload);
        setLoadStatus("ready");
      } catch (error) {
        if (controller.signal.aborted) return;
        setData(null);
        setLoadError(error instanceof Error && error.message ? error.message : "公司详情服务暂时不可用，请稍后重试。");
        setLoadStatus("error");
      }
    };

    void loadCompanyDetails();

    return () => {
      controller.abort();
    };
  }, [loadAttempt, refreshKey, stockCode]);

  const startEditing = () => {
    if (!data) return;
    setDraft(draftFromCompany(data.company));
    setFormError("");
    setIsEditing(true);
  };

  const updateDraft = (patch: Partial<CompanyDraft>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setFormError("");
  };

  const startEditingResearchProfile = () => {
    if (!data) return;
    setResearchDraft(researchDraftFromTemplate(data.company, data.relations, data.researchProfile));
    setResearchFormError("");
    setIsEditingResearchProfile(true);
  };

  const updateResearchDraft = (patch: Partial<ResearchProfileDraft>) => {
    setResearchDraft((current) => (current ? { ...current, ...patch } : current));
    setResearchFormError("");
  };

  const refreshDetails = async (code: string) => {
    const response = await fetch(`/api/companies/${code}`);
    if (!response.ok) return;
    const payload = (await response.json()) as CompanyDetailResponse;
    setData(payload);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!stockCode || !draft) return;
    if (!draft.shortName.trim()) {
      setFormError("公司简称不能为空");
      return;
    }

    const response = await fetch(`/api/companies/${stockCode}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const result = (await response.json().catch(() => ({}))) as { company?: Company; error?: string };
    if (!response.ok || !result.company) {
      setFormError(result.error ?? "保存公司资料失败");
      return;
    }

    setData((current) => (current ? { ...current, company: result.company! } : current));
    setIsEditing(false);
    setDraft(null);
    onChanged();
  };

  const handleResearchProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!stockCode || !researchDraft) return;

    const businessLines = parseBusinessLines(researchDraft.businessLinesText);
    if (businessLines.length === 0) {
      setResearchFormError("至少填写一条核心业务");
      return;
    }

    const response = await fetch(`/api/companies/${stockCode}/research-profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: researchDraft.summary,
        businessLines,
        chainPosition: parseLines(researchDraft.chainPositionText),
        competitiveAdvantages: parseLines(researchDraft.competitiveAdvantagesText),
        keyCustomers: parseLines(researchDraft.keyCustomersText),
        catalysts: parseLines(researchDraft.catalystsText),
        risks: parseLines(researchDraft.risksText),
        sourceSummary: researchDraft.sourceSummary,
      }),
    });
    const result = (await response.json().catch(() => ({}))) as { researchProfile?: CompanyResearchProfile; error?: string };
    if (!response.ok || !result.researchProfile) {
      setResearchFormError(result.error ?? "保存结构化资料失败");
      return;
    }

    setData((current) => (current ? { ...current, researchProfile: result.researchProfile! } : current));
    setIsEditingResearchProfile(false);
    setResearchDraft(null);
    onChanged();
  };

  const startEditingNote = () => {
    if (!data) return;
    const detail = buildCompanyResearchDetail({
      company: data.company,
      relations: data.relations,
      evidenceByRelationId: data.evidenceByRelationId,
      researchProfile: data.researchProfile,
      notes: data.notes,
    });
    setNoteDraft(detail.note.content);
    setNoteError("");
    setIsEditingNote(true);
  };

  const handleNoteSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!stockCode) return;
    const response = await fetch(`/api/companies/${stockCode}/note`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: noteDraft }),
    });
    const result = (await response.json().catch(() => ({}))) as { note?: { id: number; noteType: string; content: string }; error?: string };
    if (!response.ok || !result.note) {
      setNoteError(result.error ?? "保存备注失败");
      return;
    }
    setData((current) => (current ? { ...current, notes: [result.note!, ...current.notes.filter((note) => note.noteType !== "我的备注")] } : current));
    setIsEditingNote(false);
    setNoteError("");
    onChanged();
  };

  const handleSyncRelation = async (relation: CompanyRelation) => {
    if (!stockCode) return;
    setSyncingRelationId(relation.id);
    setSyncError("");

    try {
      const queuedTask = await enqueueCompanyProfileSync(stockCode, {
        categoryId: relation.categoryId,
        force: true,
      });
      setData((current) => current ? {
        ...current,
        latestSyncTask: queuedTask,
        syncTasks: [queuedTask, ...current.syncTasks.filter((task) => task.id !== queuedTask.id)],
      } : current);

      const task = await pollCompanyProfileSync(stockCode, queuedTask.id, {
        onSnapshot: (nextTask) => {
          setData((current) => current ? {
            ...current,
            latestSyncTask: nextTask,
            syncTasks: [nextTask, ...current.syncTasks.filter((item) => item.id !== nextTask.id)],
          } : current);
        },
      });
      await refreshDetails(stockCode);
      if (task?.status === "failed") {
        setSyncError(task.error || task.message || "同步资料失败");
      }
      onChanged();
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "同步资料失败");
    } finally {
      setSyncingRelationId(null);
    }
  };

  if (!stockCode) {
    return (
      <div className="h-full">
        <div className="text-xs font-semibold uppercase text-muted">公司研究详情</div>
        <div className="mt-8 rounded-lg border border-dashed border-line bg-white/55 p-6 text-sm text-muted">
          请选择一家公司查看研究详情
        </div>
      </div>
    );
  }

  if (loadStatus === "error") {
    return (
      <div className="h-full">
        <div className="text-xs font-semibold uppercase text-muted">公司研究详情</div>
        <div className="mt-4 grid gap-3 rounded-lg border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800" role="alert">
          <div className="flex items-start gap-2">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              <strong className="block">公司详情加载失败</strong>
              <p className="mt-1 text-xs">{loadError}</p>
            </div>
          </div>
          <button
            type="button"
            className="action-button inline-flex h-9 w-fit items-center gap-1 px-3 text-sm font-semibold"
            onClick={() => setLoadAttempt((value) => value + 1)}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            重新加载
          </button>
        </div>
      </div>
    );
  }

  if (loadStatus !== "ready" || !data) {
    return (
      <div className="h-full">
        <div className="text-xs font-semibold uppercase text-muted">公司研究详情</div>
        <div className="mt-4 flex items-center gap-2 text-sm text-muted" role="status" aria-live="polite">
          <span className="h-2 w-2 rounded-full bg-cyan-500 shadow-[0_0_16px_rgba(6,182,212,0.75)]" aria-hidden="true" />
          加载公司详情中...
        </div>
      </div>
    );
  }

  const { company, evidenceByRelationId, notes } = data;
  const relations = orderRelationsForCategory(data.relations, selectedCategoryId);
  const evidenceCount = relations.reduce((count, relation) => count + (evidenceByRelationId[String(relation.id)] ?? []).length, 0);
  const hasPendingRationale = relations.some((relation) => isPendingRationale(relation.rationale));
  const latestSyncTask = data.latestSyncTask;
  const overallState = getOverallState(backgroundSyncStatus, latestSyncTask, evidenceCount, hasPendingRationale);
  const industryTemplate = buildIndustryTemplate(company, relations, data.researchProfile);
  const researchDetail = buildCompanyResearchDetail({
    company,
    relations,
    evidenceByRelationId,
    researchProfile: data.researchProfile,
    notes,
  });

  if (company.stockCode) return <CompanyDossier
    company={company}
    detail={researchDetail}
    relations={relations}
    evidenceByRelationId={evidenceByRelationId}
    graphRelations={data.graphEntityRelations}
    latestResearchRun={data.latestResearchRun}
    researchProfile={data.researchProfile}
    industryTemplate={industryTemplate}
    latestSyncTask={latestSyncTask}
    sourceSnapshots={data.sourceSnapshots ?? []}
    fieldFacts={data.fieldFacts ?? []}
    quality={data.quality ?? emptyDossierQuality()}
    evidenceTimeline={data.evidenceTimeline ?? []}
    overallState={overallState}
    stockCode={stockCode}
    syncError={syncError}
    syncingRelationId={syncingRelationId}
    isEditing={isEditing}
    isEditingResearchProfile={isEditingResearchProfile}
    isEditingNote={isEditingNote}
    draft={draft}
    researchDraft={researchDraft}
    noteDraft={noteDraft}
    formError={formError}
    researchFormError={researchFormError}
    noteError={noteError}
    onSyncRelation={handleSyncRelation}
    onToggleCompanyEdit={isEditing ? () => setIsEditing(false) : startEditing}
    onToggleResearchEdit={isEditingResearchProfile ? () => setIsEditingResearchProfile(false) : startEditingResearchProfile}
    onToggleNoteEdit={isEditingNote ? () => setIsEditingNote(false) : startEditingNote}
    onCompanySubmit={handleSubmit}
    onResearchSubmit={handleResearchProfileSubmit}
    onNoteSubmit={handleNoteSubmit}
    onCompanyDraftChange={updateDraft}
    onResearchDraftChange={updateResearchDraft}
    onNoteDraftChange={setNoteDraft}
    onRefreshGraph={() => refreshDetails(stockCode)}
    onOpenAi={onOpenAi}
    onOpenReport={onOpenReport}
    onOpenAtlas={onOpenAtlas}
    onOpenSector={onOpenSector}
  />;

  return (
    <div className="company-profile-shell flex h-full flex-col">
      <div className="company-profile-head flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase text-muted">公司研究详情</div>
          <h2 className="mt-1 text-xl font-semibold">{company.shortName}</h2>
          <p data-testid="company-summary-line" className="company-summary-line mt-1" title={`${company.stockCode} · ${company.board || "上市板待补"} · ${company.industry || "行业待补"} · ${researchDetail.tags.slice(0, 4).join(" · ")}`}>
            <span>{company.stockCode}</span>
            <span>{company.board || "上市板待补"}</span>
            <span>{company.industry || "行业待补"}</span>
            {researchDetail.tags.slice(0, 4).map((tag) => (
              <span key={tag} className="company-summary-chip">
                {tag}
              </span>
            ))}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {relations[0] ? (
            <button
              type="button"
              onClick={() => handleSyncRelation(relations[0])}
              disabled={syncingRelationId === relations[0].id || backgroundSyncStatus?.state === "syncing"}
              className="action-button inline-flex h-9 items-center gap-1 px-3 text-sm font-semibold disabled:cursor-wait disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${syncingRelationId === relations[0].id ? "animate-spin" : ""}`} />
              同步资料
            </button>
          ) : null}
          <button
            type="button"
            onClick={isEditing ? () => setIsEditing(false) : startEditing}
            className="action-button inline-flex h-9 items-center gap-1 px-3 text-sm font-semibold"
          >
            {isEditing ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
            {isEditing ? "取消编辑" : "编辑公司资料"}
          </button>
        </div>
      </div>

      <nav className="company-profile-tabs" aria-label="公司研究资料分区">
        {['概览', '业务产品', '产业链', '财务估值', '事件催化', '风险', `证据 ${evidenceCount}`].map((item, index) => (
          <span className={index === 0 ? 'is-active' : ''} key={item}>{item}</span>
        ))}
      </nav>

      {latestSyncTask ? (
        <div className="mt-3 rounded-lg border border-line bg-white/55 px-3 py-2 text-xs text-slate-600">
          最近同步：{syncStatusLabel(latestSyncTask.status)} · {latestSyncTask.message || latestSyncTask.source || "暂无说明"}
        </div>
      ) : null}
      {syncError ? <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{syncError}</div> : null}

      {isEditing && draft ? (
        <form onSubmit={handleSubmit} className="mt-4 rounded-md border border-[#cfe2d8] bg-[#f7fbf9] p-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              公司简称
              <input
                value={draft.shortName}
                onChange={(event) => updateDraft({ shortName: event.target.value })}
                className="h-9 rounded border border-line bg-white px-2 text-sm font-normal outline-none focus:border-[#73b99a]"
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              上市板
              <input
                value={draft.board}
                onChange={(event) => updateDraft({ board: event.target.value })}
                className="h-9 rounded border border-line bg-white px-2 text-sm font-normal outline-none focus:border-[#73b99a]"
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              行业
              <input
                value={draft.industry}
                onChange={(event) => updateDraft({ industry: event.target.value })}
                className="h-9 rounded border border-line bg-white px-2 text-sm font-normal outline-none focus:border-[#73b99a]"
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              地区
              <input
                value={draft.region}
                onChange={(event) => updateDraft({ region: event.target.value })}
                className="h-9 rounded border border-line bg-white px-2 text-sm font-normal outline-none focus:border-[#73b99a]"
              />
            </label>
            <label className="col-span-2 grid gap-1 text-xs font-semibold text-slate-600">
              公司全称
              <input
                value={draft.fullName}
                onChange={(event) => updateDraft({ fullName: event.target.value })}
                className="h-9 rounded border border-line bg-white px-2 text-sm font-normal outline-none focus:border-[#73b99a]"
              />
            </label>
            <label className="col-span-2 grid gap-1 text-xs font-semibold text-slate-600">
              市值区间
              <input
                value={draft.marketCapBand}
                onChange={(event) => updateDraft({ marketCapBand: event.target.value })}
                className="h-9 rounded border border-line bg-white px-2 text-sm font-normal outline-none focus:border-[#73b99a]"
              />
            </label>
            <label className="col-span-2 grid gap-1 text-xs font-semibold text-slate-600">
              公司简介
              <textarea
                value={draft.intro}
                onChange={(event) => updateDraft({ intro: event.target.value })}
                rows={3}
                className="resize-none rounded border border-line bg-white px-2 py-2 text-sm font-normal outline-none focus:border-[#73b99a]"
              />
            </label>
            <label className="col-span-2 grid gap-1 text-xs font-semibold text-slate-600">
              主营业务
              <textarea
                value={draft.mainBusiness}
                onChange={(event) => updateDraft({ mainBusiness: event.target.value })}
                rows={3}
                className="resize-none rounded border border-line bg-white px-2 py-2 text-sm font-normal outline-none focus:border-[#73b99a]"
              />
            </label>
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
            {formError ? <span className="text-xs text-rose-600">{formError}</span> : null}
            <button
              type="submit"
              className="action-button-primary inline-flex h-9 items-center gap-1 px-3 text-sm font-semibold"
            >
              <Check className="h-4 w-4" />
              保存公司资料
            </button>
          </div>
        </form>
      ) : null}

      <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-auto pr-1 text-sm">
        <InstantBriefCard
          detail={researchDetail}
          company={company}
          syncStatus={overallState.label}
          syncTone={overallState.tone}
          evidenceCount={evidenceCount}
          completionScore={data.quality?.overallScore ?? 0}
        />

        <ResearchCard
          icon={<Layers3 className="h-4 w-4" />}
          title="业务与产业要点"
          aside={
            <button
              type="button"
              onClick={isEditingResearchProfile ? () => setIsEditingResearchProfile(false) : startEditingResearchProfile}
              className="action-button inline-flex h-8 items-center gap-1.5 px-2.5 text-xs font-semibold"
            >
              {isEditingResearchProfile ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
              {isEditingResearchProfile ? "取消" : "编辑"}
            </button>
          }
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs text-muted">收入占比和毛利率缺失时保持待补，不自动编造</span>
          </div>

          {isEditingResearchProfile && researchDraft ? (
            <form onSubmit={handleResearchProfileSubmit} className="grid gap-2 rounded-lg border border-cyan-100 bg-cyan-50/35 p-2">
              <label className="grid gap-1 text-xs font-semibold text-slate-600">
                研究摘要
                <textarea
                  value={researchDraft.summary}
                  onChange={(event) => updateResearchDraft({ summary: event.target.value })}
                  rows={3}
                  className="research-input min-h-20 resize-y"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-600">
                核心业务（每行：业务 | 占比 | 毛利率）
                <textarea
                  value={researchDraft.businessLinesText}
                  onChange={(event) => updateResearchDraft({ businessLinesText: event.target.value })}
                  rows={4}
                  className="research-input font-mono text-xs"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <ResearchTextarea label="产业链位置" value={researchDraft.chainPositionText} onChange={(value) => updateResearchDraft({ chainPositionText: value })} />
                <ResearchTextarea label="核心竞争优势" value={researchDraft.competitiveAdvantagesText} onChange={(value) => updateResearchDraft({ competitiveAdvantagesText: value })} />
                <ResearchTextarea label="核心客户" value={researchDraft.keyCustomersText} onChange={(value) => updateResearchDraft({ keyCustomersText: value })} />
                <ResearchTextarea label="催化因素" value={researchDraft.catalystsText} onChange={(value) => updateResearchDraft({ catalystsText: value })} />
                <ResearchTextarea label="风险因素" value={researchDraft.risksText} onChange={(value) => updateResearchDraft({ risksText: value })} />
                <label className="grid gap-1 text-xs font-semibold text-slate-600">
                  来源摘要
                  <textarea
                    value={researchDraft.sourceSummary}
                    onChange={(event) => updateResearchDraft({ sourceSummary: event.target.value })}
                    rows={3}
                    className="research-input"
                  />
                </label>
              </div>
              <div className="flex items-center justify-end gap-2">
                {researchFormError ? <span className="text-xs text-rose-600">{researchFormError}</span> : null}
                <button type="submit" className="action-button-primary inline-flex h-9 items-center gap-1.5 px-3 text-sm font-semibold">
                  <Check className="h-4 w-4" />
                  保存结构化资料
                </button>
              </div>
            </form>
          ) : (
            <div className="grid gap-2">
              <BusinessSegmentList segments={researchDetail.businessSegments} />
              <MergedInsightGrid
                items={[
                  { icon: <Bot className="h-3.5 w-3.5" />, title: "产业链位置", values: industryTemplate.position },
                  { icon: <ShieldCheck className="h-3.5 w-3.5" />, title: "核心竞争优势", values: industryTemplate.advantages },
                  { icon: <FileText className="h-3.5 w-3.5" />, title: "核心客户", values: industryTemplate.customers },
                  { icon: <Gauge className="h-3.5 w-3.5" />, title: "核心变量", values: industryTemplate.keyVariables },
                ]}
              />
            </div>
          )}
        </ResearchCard>

        <ResearchCard icon={<TrendingUp className="h-4 w-4" />} title="催化与跟踪点">
          <CatalystList catalysts={researchDetail.catalysts} />
        </ResearchCard>

        <CompanyGraphRelationsCard stockCode={stockCode} relations={data.graphEntityRelations} onSaved={() => refreshDetails(stockCode)} />

        <ResearchCard
          icon={<MessageSquare className="h-4 w-4" />}
          title="我的研究备注"
          aside={
            <button type="button" onClick={isEditingNote ? () => setIsEditingNote(false) : startEditingNote} className="action-button inline-flex h-8 items-center gap-1.5 px-2.5 text-xs font-semibold">
              {isEditingNote ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
              {isEditingNote ? "取消" : "编辑"}
            </button>
          }
        >
          {isEditingNote ? (
            <form onSubmit={handleNoteSubmit} className="grid gap-2">
              <textarea value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} rows={4} className="research-input min-h-24 resize-y" placeholder="记录你的研究判断、疑点和后续跟踪计划" />
              <div className="flex items-center justify-end gap-2">
                {noteError ? <span className="text-xs text-rose-600">{noteError}</span> : null}
                <button type="submit" className="action-button-primary inline-flex h-9 items-center gap-1.5 px-3 text-sm font-semibold">
                  <Check className="h-4 w-4" />
                  保存备注
                </button>
              </div>
            </form>
          ) : (
            <p className="leading-6 text-slate-700">{researchDetail.note.content || "暂无研究备注。可记录你的判断、待验证问题和跟踪计划。"}</p>
          )}
        </ResearchCard>
      </div>
    </div>
  );
}

function isCompanyDetailResponse(payload: unknown): payload is CompanyDetailResponse {
  return typeof payload === "object" && payload !== null && "company" in payload;
}

function companyDetailResponseError(payload: unknown, status: number) {
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    const message = (payload as { error?: unknown }).error;
    if (typeof message === "string" && message.trim()) return message;
  }
  return `公司详情加载失败（HTTP ${status}），请稍后重试。`;
}

type CompanyDossierProps = {
  company: Company;
  detail: ReturnType<typeof buildCompanyResearchDetail>;
  relations: CompanyRelation[];
  evidenceByRelationId: Record<string, EvidenceRow[]>;
  graphRelations: CompanyGraphEntityRelation[];
  latestResearchRun: StoredResearchRun | null;
  researchProfile: CompanyResearchProfile | null;
  industryTemplate: ReturnType<typeof buildIndustryTemplate>;
  latestSyncTask: SyncTask | null;
  sourceSnapshots: CompanySourceSnapshot[];
  fieldFacts: CompanyFieldFact[];
  quality: CompanyDossierQuality;
  evidenceTimeline: CompanyEvidenceTimelineItem[];
  overallState: { label: string; message: string; tone: StateTone };
  stockCode: string;
  syncError: string;
  syncingRelationId: number | null;
  isEditing: boolean;
  isEditingResearchProfile: boolean;
  isEditingNote: boolean;
  draft: CompanyDraft | null;
  researchDraft: ResearchProfileDraft | null;
  noteDraft: string;
  formError: string;
  researchFormError: string;
  noteError: string;
  onSyncRelation: (relation: CompanyRelation) => Promise<void>;
  onToggleCompanyEdit: () => void;
  onToggleResearchEdit: () => void;
  onToggleNoteEdit: () => void;
  onCompanySubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onResearchSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onNoteSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onCompanyDraftChange: (patch: Partial<CompanyDraft>) => void;
  onResearchDraftChange: (patch: Partial<ResearchProfileDraft>) => void;
  onNoteDraftChange: (value: string) => void;
  onRefreshGraph: () => Promise<void>;
  onOpenAi?: () => void;
  onOpenReport?: () => void;
  onOpenAtlas?: () => void;
  onOpenSector?: () => void;
};

function CompanyDossier(props: CompanyDossierProps) {
  const {
    company, detail, relations, evidenceByRelationId, graphRelations, latestResearchRun, researchProfile, industryTemplate,
    latestSyncTask, sourceSnapshots, fieldFacts, quality, evidenceTimeline, overallState, stockCode, syncError, syncingRelationId,
    isEditing, isEditingResearchProfile, isEditingNote, draft, researchDraft, noteDraft,
    formError, researchFormError, noteError, onSyncRelation, onToggleCompanyEdit, onToggleResearchEdit,
    onToggleNoteEdit, onCompanySubmit, onResearchSubmit, onNoteSubmit, onCompanyDraftChange,
    onResearchDraftChange, onNoteDraftChange, onRefreshGraph, onOpenAi, onOpenReport, onOpenAtlas, onOpenSector,
  } = props;
  const primaryRelation = relations[0];
  const evidenceRows = relations.flatMap((relation) => evidenceByRelationId[String(relation.id)] ?? []);
  const syncPresentation = buildSyncPresentation(latestSyncTask, sourceSnapshots, syncError);
  const fact = (fieldKey: string) => getBestFieldFact(fieldFacts, fieldKey);
  const valuation = {
    price: getNumericFieldFact(fieldFacts, "price"),
    peTtm: getNumericFieldFact(fieldFacts, "peTtm"),
    pb: getNumericFieldFact(fieldFacts, "pb"),
    turnoverPercent: getNumericFieldFact(fieldFacts, "turnoverPercent"),
    totalMarketCapYi: getNumericFieldFact(fieldFacts, "totalMarketCapYi"),
    revenue: getNumericFieldFact(fieldFacts, "revenue"),
    netProfit: getNumericFieldFact(fieldFacts, "netProfit"),
    operatingCashFlow: getNumericFieldFact(fieldFacts, "operatingCashFlow"),
    debtRatio: getNumericFieldFact(fieldFacts, "debtRatio"),
  };
  const businessSegments = getBusinessSegmentsFromFacts(fieldFacts) ?? detail.businessSegments;
  const disclosureEvents = buildDisclosureEvents(fieldFacts);
  const whyAttention = getWhyAttention(industryTemplate.advantages, detail.catalysts.map((item) => item.title));
  const isSyncing = syncingRelationId === primaryRelation?.id
    || latestSyncTask?.status === "pending"
    || latestSyncTask?.status === "running";
  const navigation = [
    { icon: <Building2 />, label: "公司概览", target: 0 },
    { icon: <BarChart3 />, label: "核心数据", target: 3 },
    { icon: <PackageSearch />, label: "业务与产品", target: 1 },
    { icon: <Waypoints />, label: "产业链位置", target: 2 },
    { icon: <ShieldCheck />, label: "竞争格局", target: 4 },
    { icon: <Users />, label: "客户与供应", target: 4 },
    { icon: <MessageSquare />, label: "研究备注", target: 6 },
    { icon: <Database />, label: "证据档案", target: 6 },
  ];

  return <article className="company-dossier">
    <header className="company-dossier-identity">
      <div className="company-dossier-mark" aria-hidden="true">{company.shortName.slice(0, 2)}</div>
      <div className="company-dossier-name">
        <div><h2>{company.shortName}</h2><strong>{company.stockCode}</strong></div>
        <p data-testid="company-summary-line">
          <span>{company.board || "上市板待补"}</span><span>{company.industry || "行业待补"}</span>
          {detail.tags.slice(0, 2).map((tag) => <em key={tag}>{tag}</em>)}
        </p>
      </div>
      <div className="company-dossier-head-metrics">
        <span><small>研究状态</small><b>{detail.researchStatus}</b></span>
        <span><small>证据节点</small><b>{evidenceTimeline.length}</b></span>
        <span><small>最后更新</small><b>{formatCompactDate(detail.updatedAt)}</b></span>
      </div>
      <div className="company-dossier-actions">
        <button type="button" onClick={onOpenAi}><Sparkles />问向 AI</button>
        <button type="button" onClick={onOpenReport}><ScrollText />生成报告</button>
        <button type="button" onClick={onOpenSector}><GitCompareArrows />加入对比</button>
        <button type="button" onClick={onOpenAtlas}><Target />在图谱中定位</button>
        {primaryRelation ? <button type="button" onClick={() => onSyncRelation(primaryRelation)} disabled={isSyncing}><RefreshCw className={isSyncing ? "animate-spin" : ""} />{syncPresentation.actionLabel}</button> : null}
        <button type="button" aria-label="编辑公司资料" onClick={onToggleCompanyEdit}><MoreHorizontal /></button>
      </div>
    </header>

    <nav className="company-dossier-tabs" aria-label="公司研究资料分区">
      {["概览", "业务产品", "产业链", "财务估值", "事件催化", "风险", `证据 ${evidenceTimeline.length}`].map((item, index) => <a key={item} className={index === 0 ? "is-active" : ""} href={`#company-section-${index}`}>{item}</a>)}
    </nav>

    {syncPresentation.visible ? (
      <div className={`company-dossier-alert is-${syncPresentation.tone}`} role="status" aria-live="polite">
        <span className="company-dossier-alert-summary">
          <RefreshCw className={isSyncing ? "animate-spin" : ""} />
          <b>{syncPresentation.label}</b>
          <span>{syncPresentation.message}</span>
        </span>
        {sourceSnapshots.length ? (
          <span className="company-dossier-source-status" aria-label={`数据源 ${syncPresentation.successfulSources}/${sourceSnapshots.length} 可用`}>
            <em>数据源 {syncPresentation.successfulSources}/{sourceSnapshots.length}</em>
            {sourceSnapshots.slice(0, 10).map((snapshot) => (
              <i
                key={snapshot.provider}
                className={`is-${sourceSnapshotTone(snapshot.status)}`}
                title={`${snapshot.providerLabel || snapshot.provider}：${sourceSnapshotLabel(snapshot.status)}${snapshot.error ? ` · ${snapshot.error}` : ""}`}
              >
                {snapshot.providerLabel || snapshot.provider}
              </i>
            ))}
          </span>
        ) : null}
      </div>
    ) : null}

    <div className="company-dossier-layout">
      <aside className="company-dossier-navigation">
        <section><h3>公司导航</h3>{navigation.map((item, index) => <a key={item.label} className={index === 0 ? "is-active" : ""} href={`#company-section-${item.target}`}>{item.icon}<span>{item.label}</span></a>)}</section>
        <section className="company-dossier-events"><h3>最新动态</h3>{dossierEvidenceFallback(evidenceRows).slice(0, 5).map((item) => <div key={item.id}><span>{item.sourceType || "资料"}</span><p>{item.title}</p><time>{item.sourceDate || "待同步"}</time></div>)}</section>
      </aside>

      <section className="company-dossier-main" aria-label="公司研究档案正文">
        {isEditing && draft ? <CompanyEditor draft={draft} error={formError} onChange={onCompanyDraftChange} onSubmit={onCompanySubmit} onClose={onToggleCompanyEdit} /> : null}

        <section id="company-section-0" data-testid="instant-company-brief" className="dossier-panel company-dossier-overview">
          <PanelHeading title="公司概览" action={<button type="button" onClick={onToggleCompanyEdit}><Pencil />编辑</button>} />
          <p className="company-dossier-intro">{detail.atAGlance.headline}</p>
          <div className="company-four-questions" aria-label="公司档案核心四问">
            <DossierQuestion index="01" label="公司做什么" value={detail.atAGlance.business} />
            <DossierQuestion index="02" label="处于哪个环节" value={`${detail.atAGlance.chain} · ${detail.atAGlance.relation}`} />
            <DossierQuestion index="03" label="为什么值得关注" value={whyAttention} muted={isPendingDossierText(whyAttention)} />
            <DossierQuestion
              index="04"
              label="证据是否可靠"
              value={`${quality.reliabilityLabel} · 综合 ${quality.overallScore}% · 证据 ${quality.evidenceCoverageScore}%`}
              tone={quality.reliabilityLabel === "可靠" ? "good" : quality.reliabilityLabel === "资料不足" ? "weak" : "pending"}
              href="#company-section-6"
            />
          </div>
          <div className="company-overview-facts">
            <DossierFact icon={<Landmark />} label="公司全称" value={company.fullName || "待补"} fact={fact("fullName")} />
            <DossierFact icon={<Building2 />} label="地区" value={company.region || "待补"} fact={fact("region")} />
            <DossierFact icon={<PieChart />} label="市值区间" value={company.marketCapBand || "待补"} fact={fact("totalMarketCapYi")} />
            <DossierFact icon={<Layers3 />} label="当前环节" value={detail.atAGlance.chain} />
            <DossierFact icon={<ShieldCheck />} label="关系判断" value={detail.atAGlance.relation} />
            <DossierFact icon={<RefreshCw />} label="资料状态" value={overallState.label} />
          </div>
          <span className={`company-sync-state is-${overallState.tone}`}>{overallState.message}</span>
        </section>

        {latestResearchRun?.result ? (
          <section className="dossier-panel company-latest-ai" data-testid="company-latest-ai-research">
            <PanelHeading
              title="最近 AI 联合研判"
              meta={`${researchDepthLabel(latestResearchRun.depth)} · ${formatCompactDate(latestResearchRun.updatedAt)}`}
              action={<button type="button" onClick={onOpenAi}>继续研究<ArrowRight /></button>}
            />
            <div>
              <span className={`is-${aiConfidenceTone(latestResearchRun.result.confidence)}`}>{latestResearchRun.result.confidence}置信</span>
              <h4>{latestResearchRun.result.thesis}</h4>
              <p>{latestResearchRun.result.investmentValue}</p>
            </div>
            <footer>
              <span><Link2 />有效引用 {latestResearchRun.result.citations?.length ?? 0}</span>
              <span><Bot />Agent 调用 {latestResearchRun.result.execution?.agentCalls ?? "—"}</span>
              <span><ShieldCheck />拦截无依据 {latestResearchRun.result.unsupportedClaimCount ?? 0}</span>
            </footer>
          </section>
        ) : null}

        <div className="company-dossier-dual">
          <section id="company-section-1" className="dossier-panel"><PanelHeading title="主营业务构成" meta={businessSegments === detail.businessSegments ? "结构化研究资料" : "东方财富 F10 实际披露"} action={<button type="button" onClick={onToggleResearchEdit}><Pencil />编辑业务</button>} /><BusinessMix segments={businessSegments} sourceFact={fact("businessComposition")} /></section>
          <section id="company-section-2" className="dossier-panel"><PanelHeading title="在产业链中的位置" action={<button type="button" onClick={onOpenAtlas}>查看产业链图谱<ArrowRight /></button>} /><ChainPosition relation={primaryRelation} position={industryTemplate.position} /></section>
        </div>

        {isEditingResearchProfile && researchDraft ? <ResearchProfileEditor draft={researchDraft} error={researchFormError} onChange={onResearchDraftChange} onSubmit={onResearchSubmit} onClose={onToggleResearchEdit} /> : null}

        <section id="company-section-3" className="dossier-panel company-finance-strip"><PanelHeading title="财务与估值" meta="财报原值 · 同步后自动更新" /><div>
          <MetricCell label="营业收入" value={formatYuanAmount(valuation.revenue)} fact={fact("revenue")} /><MetricCell label="归母净利润" value={formatYuanAmount(valuation.netProfit)} fact={fact("netProfit")} />
          <MetricCell label="经营现金流" value={formatYuanAmount(valuation.operatingCashFlow)} fact={fact("operatingCashFlow")} /><MetricCell label="资产负债率" value={formatRatioMetric(valuation.debtRatio)} fact={fact("debtRatio")} />
          <MetricCell label="最新价" value={formatFinancialMetric(valuation.price, "元")} fact={fact("price")} /><MetricCell label="PE (TTM)" value={formatFinancialMetric(valuation.peTtm, "x")} fact={fact("peTtm")} />
        </div></section>

        <div className="company-dossier-triple">
          <InsightPanel id="company-section-4" title="核心竞争优势" icon={<ShieldCheck />} items={industryTemplate.advantages} tone="positive" sourceSummary={researchProfile?.sourceSummary} />
          <InsightPanel title="事件催化" icon={<TrendingUp />} items={detail.catalysts.map((item) => item.title)} tone="catalyst" sourceSummary={researchProfile?.sourceSummary} />
          <InsightPanel id="company-section-5" title="主要风险" icon={<CircleAlert />} items={detail.risks.map((item) => item.content)} tone="risk" sourceSummary={researchProfile?.sourceSummary} />
        </div>

        <section id="company-section-6" className="dossier-panel company-evidence-summary">
          <PanelHeading title={`证据时间线（${evidenceTimeline.length} 项）`} meta="字段来源、公告、研报与关系证据统一归档" action={<button type="button" onClick={onOpenAi}>交叉核验<ArrowRight /></button>} />
          <EvidenceTimeline items={evidenceTimeline} />
        </section>

        <CompanyGraphRelationsCard stockCode={stockCode} relations={graphRelations} onSaved={onRefreshGraph} />
        <section className="dossier-panel company-research-note"><PanelHeading title="我的研究备注" action={<button type="button" onClick={onToggleNoteEdit}>{isEditingNote ? <X /> : <Pencil />}{isEditingNote ? "取消" : "编辑"}</button>} />
          {isEditingNote ? <form onSubmit={onNoteSubmit}><textarea value={noteDraft} onChange={(event) => onNoteDraftChange(event.target.value)} rows={4} placeholder="记录你的研究判断、疑点和跟踪计划" /><div>{noteError ? <span>{noteError}</span> : null}<button type="submit"><Check />保存备注</button></div></form> : <p>{detail.note.content || "暂无研究备注。可记录你的判断、待验证问题和跟踪计划。"}</p>}
        </section>
      </section>

      <aside className="company-dossier-quality">
        <section className="dossier-panel company-quality-card">
          <PanelHeading title="档案质量" action={<span className={`quality-reliability is-${qualityTone(quality.reliabilityLabel)}`}>{quality.reliabilityLabel}</span>} />
          <div className="company-completeness"><div style={{ "--completion": `${quality.overallScore * 3.6}deg` } as CSSProperties}><strong>{quality.overallScore}%</strong><span>综合质量</span></div><div className="company-quality-stats">
            <QualityBar label="字段覆盖" value={quality.fieldCoverageScore} />
            <QualityBar label="证据覆盖" value={quality.evidenceCoverageScore} />
            <QualityBar label="资料时效" value={quality.freshnessScore} />
          </div></div>
          <ul className="company-quality-dimensions">{quality.dimensions.map((item) => <QualityRow key={item.id} label={item.label} status={item.status} detail={item.detail} />)}</ul>
        </section>
        <section className="dossier-panel company-quality-issues"><PanelHeading title="待完善项" action={<span>{quality.criticalIssues.length} 项</span>} />{quality.criticalIssues.length
          ? <ul>{quality.criticalIssues.slice(0, 5).map((issue) => <li key={`${issue.fieldKey}-${issue.status}`}><CircleAlert /><span><strong>{issue.label}</strong><small>{issue.reason}</small></span><em className={`is-${issue.status}`}>{qualityIssueLabel(issue.status)}</em></li>)}</ul>
          : <p><ShieldCheck />关键资料与证据状态良好</p>}</section>
        <section className="dossier-panel company-latest-evidence"><PanelHeading title="最新公告 / 研报" />{disclosureEvents.length > 0
          ? disclosureEvents.slice(0, 4).map((item) => <div key={`${item.kind}-${item.title}-${item.date}`}><FileText /><span>{item.title}</span><time>{item.date || "待补"}</time></div>)
          : <div><FileText /><span>公告与机构研报待补</span><time>待同步</time></div>}</section>
        <section className="dossier-panel company-next-actions"><PanelHeading title="下一步建议" /><button type="button" onClick={onOpenReport}>生成公司深度研究报告<ChevronRight /></button><button type="button" onClick={onOpenSector}>与同赛道公司对比分析<ChevronRight /></button><button type="button" onClick={onOpenAi}>核验核心业务与风险判断<ChevronRight /></button><button type="button" onClick={onOpenAtlas}>查看产业链上下游关系<ChevronRight /></button></section>
      </aside>
    </div>
  </article>;
}

function CompanyEditor({ draft, error, onChange, onSubmit, onClose }: { draft: CompanyDraft; error: string; onChange: (patch: Partial<CompanyDraft>) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>; onClose: () => void }) {
  return <form onSubmit={onSubmit} className="dossier-editor"><EditorTitle title="编辑公司基础资料" onClose={onClose} /><div className="dossier-editor-grid">
    <DossierInput label="公司简称" value={draft.shortName} onChange={(value) => onChange({ shortName: value })} /><DossierInput label="上市板" value={draft.board} onChange={(value) => onChange({ board: value })} />
    <DossierInput label="行业" value={draft.industry} onChange={(value) => onChange({ industry: value })} /><DossierInput label="地区" value={draft.region} onChange={(value) => onChange({ region: value })} />
    <DossierInput label="公司全称" value={draft.fullName} onChange={(value) => onChange({ fullName: value })} wide /><DossierInput label="市值区间" value={draft.marketCapBand} onChange={(value) => onChange({ marketCapBand: value })} wide />
    <DossierInput label="公司简介" value={draft.intro} onChange={(value) => onChange({ intro: value })} wide multiline /><DossierInput label="主营业务" value={draft.mainBusiness} onChange={(value) => onChange({ mainBusiness: value })} wide multiline />
  </div><EditorActions error={error} label="保存公司资料" /></form>;
}

function ResearchProfileEditor({ draft, error, onChange, onSubmit, onClose }: { draft: ResearchProfileDraft; error: string; onChange: (patch: Partial<ResearchProfileDraft>) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>; onClose: () => void }) {
  return <form onSubmit={onSubmit} className="dossier-editor"><EditorTitle title="编辑结构化研究资料" onClose={onClose} /><div className="dossier-editor-grid">
    <DossierInput label="研究摘要" value={draft.summary} onChange={(value) => onChange({ summary: value })} wide multiline /><DossierInput label="核心业务（业务 | 占比 | 毛利率）" value={draft.businessLinesText} onChange={(value) => onChange({ businessLinesText: value })} wide multiline />
    <DossierInput label="产业链位置" value={draft.chainPositionText} onChange={(value) => onChange({ chainPositionText: value })} multiline /><DossierInput label="核心竞争优势" value={draft.competitiveAdvantagesText} onChange={(value) => onChange({ competitiveAdvantagesText: value })} multiline />
    <DossierInput label="核心客户" value={draft.keyCustomersText} onChange={(value) => onChange({ keyCustomersText: value })} multiline /><DossierInput label="催化因素" value={draft.catalystsText} onChange={(value) => onChange({ catalystsText: value })} multiline />
    <DossierInput label="风险因素" value={draft.risksText} onChange={(value) => onChange({ risksText: value })} multiline /><DossierInput label="来源摘要" value={draft.sourceSummary} onChange={(value) => onChange({ sourceSummary: value })} multiline />
  </div><EditorActions error={error} label="保存结构化资料" /></form>;
}

function EditorTitle({ title, onClose }: { title: string; onClose: () => void }) { return <div className="dossier-editor-title"><strong>{title}</strong><button type="button" onClick={onClose}><X /></button></div>; }
function EditorActions({ error, label }: { error: string; label: string }) { return <div className="dossier-editor-actions">{error ? <span>{error}</span> : null}<button type="submit"><Check />{label}</button></div>; }
function DossierInput({ label, value, onChange, wide = false, multiline = false }: { label: string; value: string; onChange: (value: string) => void; wide?: boolean; multiline?: boolean }) { return <label className={wide ? "is-wide" : ""}><span>{label}</span>{multiline ? <textarea rows={3} value={value} onChange={(event) => onChange(event.target.value)} /> : <input value={value} onChange={(event) => onChange(event.target.value)} />}</label>; }
function PanelHeading({ title, meta, action }: { title: string; meta?: string; action?: ReactNode }) { return <header className="dossier-panel-heading"><div><h3>{title}</h3>{meta ? <span>{meta}</span> : null}</div>{action}</header>; }
function DossierQuestion({ index, label, value, tone = "neutral", muted = false, href }: { index: string; label: string; value: string; tone?: "neutral" | "good" | "pending" | "weak"; muted?: boolean; href?: string }) {
  const content = <><span><small>{index}</small>{label}</span><strong className={muted ? "is-muted" : ""}>{value}</strong>{href ? <ArrowRight /> : null}</>;
  return href ? <a className={`company-question-card is-${tone}`} href={href}>{content}</a> : <div className={`company-question-card is-${tone}`}>{content}</div>;
}
function DossierFact({ icon, label, value, fact }: { icon: ReactNode; label: string; value: string; fact?: CompanyFieldFact }) {
  return <div>{icon}<span><small>{label}</small><strong title={value}>{value}</strong>{fact ? <FieldSourceDetails fact={fact} compact /> : null}</span></div>;
}
function MetricCell({ label, value, fact }: { label: string; value: string; fact?: CompanyFieldFact }) {
  return <span><small>{label}</small><strong>{value}</strong><FieldSourceDetails fact={fact} compact /></span>;
}
function InsightPanel({ id, title, icon, items, tone, sourceSummary }: { id?: string; title: string; icon: ReactNode; items: string[]; tone: "positive" | "catalyst" | "risk"; sourceSummary?: string }) {
  const sourceIsPending = !sourceSummary || isPendingDossierText(sourceSummary);
  return <section id={id} className={`dossier-panel company-insight is-${tone}`}><PanelHeading title={title} action={icon} /><ul>{items.slice(0, 4).map((item) => <li key={item} className={isPendingDossierText(item) ? "is-pending" : ""}>{tone === "risk" ? <CircleAlert /> : <Check />}<span>{item}</span></li>)}</ul><div className={`company-insight-source ${sourceIsPending ? "is-pending" : ""}`}><Database />{sourceIsPending ? "研究结论待补充原始证据" : `研究来源：${sourceSummary}`}</div></section>;
}
function QualityRow({ label, status, detail }: { label: string; status: CompanyDossierQuality["dimensions"][number]["status"]; detail: string }) {
  return <li className={`is-${status}`}>{status === "complete" ? <Check /> : <CircleAlert />}<span>{label}<small>{detail}</small></span><em>{status === "complete" ? "完整" : status === "partial" ? "部分" : "待补"}</em></li>;
}

function BusinessMix({ segments, sourceFact }: { segments: ReturnType<typeof buildCompanyResearchDetail>["businessSegments"]; sourceFact?: CompanyFieldFact }) {
  const known = segments.map((item) => item.revenueRatio ?? 0); const total = known.reduce((sum, value) => sum + value, 0);
  return <><div className="company-business-mix"><div className="company-business-donut" style={{ "--business-primary": `${Math.min(100, known[0] ?? 0) * 3.6}deg` } as CSSProperties}><span><strong>{total ? `${Math.round(total)}%` : "待补"}</strong><small>已确认占比</small></span></div><div>{segments.slice(0, 4).map((segment, index) => <p key={segment.name}><i className={`is-${index + 1}`} /><span><strong>{segment.name}</strong><small>毛利率 {typeof segment.grossMargin === "number" ? `${segment.grossMargin}%` : "待确认"}</small></span><b>{typeof segment.revenueRatio === "number" ? `${segment.revenueRatio}%` : "待确认"}</b></p>)}</div></div><FieldSourceDetails fact={sourceFact} /></>;
}

function ChainPosition({ relation, position }: { relation?: CompanyRelation; position: string[] }) {
  const name = relation?.categoryName || "当前细分待补";
  return <div className="company-chain-position"><div><span>上游基础</span><ChevronRight /><strong>当前公司</strong><ChevronRight /><span>下游应用</span></div><div><span>原材料 / 技术</span><ArrowRight /><strong>{name}</strong><ArrowRight /><span>客户 / 场景</span></div><p>{position.slice(0, 2).join(" · ")}</p></div>;
}

function dossierEvidenceFallback(evidence: EvidenceRow[]): EvidenceRow[] { return evidence.length ? evidence : [{ id: 0, sourceType: "待补", title: "暂无证据，建议同步资料或手动补充", sourceDate: "", url: "", excerpt: "", credibility: "低", isExpired: false }]; }
function formatCompactDate(value: string) { const match = value.match(/\d{4}-\d{2}-\d{2}/); return match?.[0] ?? "待同步"; }
function researchDepthLabel(value: string) { return value === "quick" ? "快速研究" : value === "deep" ? "深度研究" : "标准研究"; }
function aiConfidenceTone(value: string) { return value === "高" ? "high" : value === "低" ? "low" : "medium"; }

function FieldSourceDetails({ fact, compact = false }: { fact?: CompanyFieldFact; compact?: boolean }) {
  if (!fact) return <span className={`field-source-missing ${compact ? "is-compact" : ""}`}>来源待补</span>;
  const sourceUrl = safeExternalUrl(fact.sourceUrl);
  const tone = fact.status === "failed" || fact.verificationStatus === "rejected"
    ? "failed"
    : fact.verificationStatus === "verified"
      ? "verified"
      : fact.verificationStatus === "conflicted"
        ? "conflicted"
        : "unverified";
  return <details className={`field-source-details is-${tone} ${compact ? "is-compact" : ""}`}>
    <summary><Database />{fact.providerLabel}<span>{fieldVerificationLabel(fact)}</span></summary>
    <div>
      <dl>
        <div><dt>数据源</dt><dd>{fact.providerLabel}</dd></div>
        <div><dt>采集时间</dt><dd>{formatSourceTimestamp(fact.fetchedAt)}</dd></div>
        <div><dt>可信度</dt><dd>{fact.confidence === "high" ? "高" : fact.confidence === "medium" ? "中" : "低"}</dd></div>
        <div><dt>验证状态</dt><dd>{fieldVerificationLabel(fact)}</dd></div>
      </dl>
      {fact.error ? <p>{fact.error}</p> : null}
      {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer"><Link2 />查看原始来源</a> : <span>该数据源未提供可访问原文链接</span>}
    </div>
  </details>;
}

function EvidenceTimeline({ items }: { items: CompanyEvidenceTimelineItem[] }) {
  if (items.length === 0) return <div className="company-evidence-empty"><Database /><strong>证据档案待补</strong><span>同步公司资料后，这里会按时间归档字段来源、公告、研报和产业链关系证据。</span></div>;
  return <ol className="company-evidence-timeline">{items.slice(0, 12).map((item) => {
    const sourceUrl = safeExternalUrl(item.url);
    return <li key={item.id} className={`is-${item.status}`}>
      <i aria-hidden="true" />
      <div className="company-evidence-time"><time>{item.sourceDate || formatCompactDate(item.timestamp)}</time><span>{item.kindLabel}</span></div>
      <div className="company-evidence-content">
        <div><strong>{item.title}</strong><em className={`is-${item.status}`}>{item.statusLabel}</em></div>
        <p>{item.summary || "来源记录已入库"}</p>
        <span>{item.source || "来源待补"} · 可信度{item.credibility === "high" ? "高" : item.credibility === "medium" ? "中" : "低"}</span>
      </div>
      {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer" aria-label={`打开${item.title}原始来源`}><Link2 /></a> : null}
    </li>;
  })}</ol>;
}

function QualityBar({ label, value }: { label: string; value: number }) {
  return <div><span><small>{label}</small><strong>{value}%</strong></span><i><b style={{ width: `${value}%` }} /></i></div>;
}

type StateTone = "good" | "syncing" | "pending" | "failed";

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-white/60 px-2 py-1.5">
      <div className="text-[11px] font-semibold text-muted">{label}</div>
      <div className="mt-0.5 truncate text-sm text-slate-700" title={value}>
        {value}
      </div>
    </div>
  );
}

function InstantBriefCard({
  detail,
  company,
  syncStatus,
  syncTone,
  evidenceCount,
  completionScore,
}: {
  detail: ReturnType<typeof buildCompanyResearchDetail>;
  company: Company;
  syncStatus: string;
  syncTone: StateTone;
  evidenceCount: number;
  completionScore: number;
}) {
  return (
    <section data-testid="instant-company-brief" className="instant-brief-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-cyan-700">公司速览</div>
          <p className="mt-1 text-[15px] font-semibold leading-6 text-slate-900">{detail.atAGlance.headline}</p>
        </div>
        <span className={briefStatusClass(syncTone)}>{syncStatus}</span>
      </div>
      <div className="mt-3 grid gap-2">
        <BriefLine label="做什么" value={detail.atAGlance.business} />
        <BriefLine label="当前环节" value={detail.atAGlance.chain} />
        <BriefLine label="关系判断" value={detail.atAGlance.relation} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <InfoCell label="地区" value={company.region || "待补"} />
        <InfoCell label="市值" value={company.marketCapBand || "待补"} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <BriefPill label="证据" value={`${evidenceCount} 条`} />
        <BriefPill label="完整度" value={`${completionScore}%`} />
        <BriefPill label="状态" value={detail.atAGlance.status} />
      </div>
    </section>
  );
}

function BriefLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="brief-line">
      <span>{label}</span>
      <strong title={value}>{value}</strong>
    </div>
  );
}

function BriefPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="brief-pill">
      <span>{label}</span>
      <strong>{value}</strong>
    </span>
  );
}

function ResearchCard({ icon, title, aside, children }: { icon: ReactNode; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="detail-section">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 font-semibold">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-cyan-50 text-cyan-700">{icon}</span>
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function BusinessSegmentList({ segments }: { segments: Array<{ name: string; exposure: string; revenueRatio?: number; grossMargin?: number; note: string }> }) {
  return (
    <div className="grid gap-1.5">
      {segments.map((segment) => (
        <div key={segment.name} className="rounded-lg border border-line bg-white/60 px-2 py-1.5">
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0 flex-1 font-semibold text-slate-700">{segment.name}</span>
            <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">{segment.exposure}</span>
          </div>
          <div className="mt-1 text-xs text-muted">
            收入占比：{typeof segment.revenueRatio === "number" ? `${segment.revenueRatio}%` : "待确认"} · 毛利率：
            {typeof segment.grossMargin === "number" ? `${segment.grossMargin}%` : "待确认"}
          </div>
        </div>
      ))}
    </div>
  );
}

function CatalystList({ catalysts }: { catalysts: Array<{ title: string; type: string; status: string; note: string }> }) {
  return (
    <div className="grid gap-1.5">
      {catalysts.map((item) => (
        <div key={item.title} className="flex items-start gap-2 rounded-lg bg-white/60 px-2 py-1.5">
          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-cyan-500" />
          <div className="min-w-0 flex-1">
            <div className="summary-clamp text-slate-700">{item.title}</div>
            <div className="mt-0.5 text-xs text-muted">{item.type} · {item.status}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function MergedInsightGrid({
  items,
}: {
  items: Array<{
    icon: ReactNode;
    title: string;
    values: string[];
  }>;
}) {
  return (
    <div className="merged-insight-grid">
      {items.map((item) => (
        <section key={item.title} className="merged-insight-cell">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-cyan-50 text-cyan-700">{item.icon}</span>
            {item.title}
          </div>
          <CompactList items={item.values} />
        </section>
      ))}
    </div>
  );
}

function CompactList({ items }: { items: string[] }) {
  return (
    <div className="grid gap-1.5">
      {items.map((item) => (
        <div key={item} className="summary-clamp rounded-md bg-white/60 px-2 py-1.5 text-slate-700">
          {item}
        </div>
      ))}
    </div>
  );
}

function ResearchTextarea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-slate-600">
      {label}
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={3} className="research-input" />
    </label>
  );
}

function buildIndustryTemplate(company: Company, relations: CompanyRelation[], researchProfile: CompanyResearchProfile | null) {
  if (researchProfile) {
    return {
      businessLines: researchProfile.businessLines.length > 0 ? researchProfile.businessLines : [{ name: "核心业务待补", share: "占比待补", grossMargin: "毛利率待补" }],
      position: researchProfile.chainPosition.length > 0 ? researchProfile.chainPosition : ["待补：产业链环节、上下游位置、国产替代属性"],
      advantages: researchProfile.competitiveAdvantages.length > 0 ? researchProfile.competitiveAdvantages : ["待补：技术壁垒、客户结构、产能规模、成本优势"],
      customers: researchProfile.keyCustomers.length > 0 ? researchProfile.keyCustomers : ["核心客户待补"],
      keyVariables: [
        ...researchProfile.catalysts.slice(0, 2),
        ...researchProfile.risks.slice(0, 2),
      ].filter(Boolean).length > 0
        ? [...researchProfile.catalysts.slice(0, 2), ...researchProfile.risks.slice(0, 2)]
        : ["业务收入占比与毛利率", "核心客户/订单持续性", "产能利用率与扩产节奏"],
    };
  }

  const introSentences = splitSummary(company.intro);
  const businessSentences = splitSummary(company.mainBusiness);
  const businessLines = extractBusinessLines(company.mainBusiness, company.industry);
  const categoryNames = relations.map((relation) => relation.categoryName).filter(Boolean);
  const primaryRelation = relations[0];
  const position = uniqueNonEmpty([
    company.industry ? `所属行业：${company.industry}` : "",
    categoryNames.length ? `当前细分：${categoryNames.slice(0, 3).join(" / ")}` : "",
    primaryRelation ? `关系判断：${primaryRelation.relationType} · ${primaryRelation.confidence}` : "",
  ]);
  const advantageCandidates = [...introSentences, ...businessSentences].filter((sentence) => /领先|核心|优势|客户|技术|平台|一站式|全球|自主|高端|规模|先进|龙头|壁垒/.test(sentence));
  const advantages = uniqueNonEmpty(advantageCandidates).slice(0, 3);
  const customerCandidates = [...introSentences, ...businessSentences].filter((sentence) => /客户|供应|下游|应用于|配套|合作|订单/.test(sentence));
  const customers = uniqueNonEmpty(customerCandidates).slice(0, 3);

  return {
    businessLines,
    position: position.length > 0 ? position : ["待补：产业链环节、上下游位置、国产替代属性"],
    advantages: advantages.length > 0 ? advantages : ["待补：技术壁垒、客户结构、产能规模、成本优势"],
    customers: customers.length > 0 ? customers : ["核心客户待补"],
    keyVariables: ["业务收入占比与毛利率", "核心客户/订单持续性", "产能利用率与扩产节奏"],
  };
}

function extractBusinessLines(mainBusiness: string, industry: string) {
  const shareMatches = Array.from(mainBusiness.matchAll(/([^，,；;。]{2,28}?)(?:收入|营收|业务)?(?:占比|比重|比例)?\s*[:：]?\s*(\d+(?:\.\d+)?%)/g)).map((match) => ({
    name: cleanBusinessLine(match[1]),
    share: match[2],
    grossMargin: "毛利率待补",
  }));
  const withExplicitShare = shareMatches.filter((line) => line.name);
  if (withExplicitShare.length > 0) return withExplicitShare.slice(0, 4);

  const candidates = splitSummary(mainBusiness)
    .map(cleanBusinessLine)
    .filter((line) => line && !/^相关概念/.test(line) && !/^东财行业/.test(line))
    .slice(0, 4);

  if (candidates.length > 0) {
    return uniqueNonEmpty(candidates).slice(0, 4).map((name) => ({ name, share: "占比待补", grossMargin: "毛利率待补" }));
  }

  return [{ name: industry ? `${industry}相关业务` : "核心业务待补", share: "占比待补", grossMargin: "毛利率待补" }];
}

function pickTemplateLines(current: string[] | undefined, fallback: string[]) {
  return current && current.length > 0 ? current : fallback;
}

function formatBusinessLines(lines: Array<{ name: string; share: string; grossMargin: string }>) {
  return lines.map((line) => `${line.name} | ${line.share || "占比待补"} | ${line.grossMargin || "毛利率待补"}`).join("\n");
}

function parseBusinessLines(value: string) {
  return value
    .split("\n")
    .map((line) => {
      const [name = "", share = "", grossMargin = ""] = line.split("|").map((part) => part.trim());
      return {
        name,
        share: share || "占比待补",
        grossMargin: grossMargin || "毛利率待补",
      };
    })
    .filter((line) => line.name);
}

function parseLines(value: string) {
  return uniqueNonEmpty(value.split("\n"));
}

function splitSummary(value: string) {
  return value
    .split(/[。；;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function cleanBusinessLine(value: string) {
  return value
    .replace(/^(东财行业|相关概念|主营业务|核心业务|业务)[:：]/, "")
    .replace(/[，,、]+$/g, "")
    .trim();
}

function uniqueNonEmpty(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function orderRelationsForCategory(relations: CompanyRelation[], selectedCategoryId: number | null) {
  if (!selectedCategoryId) return relations;
  return [...relations].sort((a, b) => {
    if (a.categoryId === selectedCategoryId) return -1;
    if (b.categoryId === selectedCategoryId) return 1;
    return 0;
  });
}

function getNumericFieldFact(fieldFacts: CompanyFieldFact[], fieldKey: string) {
  const fact = getBestFieldFact(fieldFacts, fieldKey);
  return typeof fact?.value === "number" && Number.isFinite(fact.value) ? fact.value : null;
}

function getBestFieldFact(fieldFacts: CompanyFieldFact[], fieldKey: string) {
  const statusRank = { available: 0, failed: 1, missing: 2, skipped: 3 };
  const verificationRank = { verified: 0, unverified: 1, conflicted: 2, rejected: 3 };
  const confidenceRank = { high: 0, medium: 1, low: 2 };
  return fieldFacts
    .filter((item) => item.fieldKey === fieldKey)
    .sort((left, right) =>
      statusRank[left.status] - statusRank[right.status]
      || verificationRank[left.verificationStatus] - verificationRank[right.verificationStatus]
      || confidenceRank[left.confidence] - confidenceRank[right.confidence]
      || right.fetchedAt.localeCompare(left.fetchedAt),
    )[0];
}

function getWhyAttention(advantages: string[], catalysts: string[]) {
  return [...advantages, ...catalysts].find((item) => item.trim() && !isPendingDossierText(item))
    ?? "尚无已验证的关注理由，建议先补充优势、订单或催化证据";
}

function isPendingDossierText(value: string) {
  return /待补|待确认|待核验|待验证|暂无|未知/.test(value);
}

function fieldVerificationLabel(fact: CompanyFieldFact) {
  if (fact.status === "failed") return "同步失败";
  if (fact.status === "missing") return "数据待补";
  if (fact.status === "skipped") return "本次跳过";
  if (fact.verificationStatus === "verified") return "已核验";
  if (fact.verificationStatus === "conflicted") return "存在冲突";
  if (fact.verificationStatus === "rejected") return "已驳回";
  return "待核验";
}

function formatSourceTimestamp(value: string) {
  if (!value) return "待同步";
  return value.replace("T", " ").replace(/\.\d{3}Z$/, " UTC").slice(0, 19);
}

function qualityTone(label: CompanyDossierQuality["reliabilityLabel"]) {
  if (label === "可靠") return "good";
  if (label === "基本可靠") return "medium";
  if (label === "待核验") return "pending";
  return "weak";
}

function qualityIssueLabel(status: CompanyDossierQuality["criticalIssues"][number]["status"]) {
  if (status === "failed") return "失败";
  if (status === "stale") return "过期";
  if (status === "conflicted") return "冲突";
  if (status === "unverified") return "待核验";
  return "待补";
}

function emptyDossierQuality(): CompanyDossierQuality {
  return {
    overallScore: 0,
    fieldCoverageScore: 0,
    evidenceCoverageScore: 0,
    freshnessScore: 0,
    reliabilityLabel: "资料不足",
    availableFields: 0,
    expectedFields: 19,
    evidencedFields: 0,
    staleFields: 0,
    failedFields: 0,
    dimensions: [
      { id: "identity", label: "基础资料", score: 0, status: "missing", available: 0, expected: 4, detail: "0/4 项可用" },
      { id: "business", label: "主营构成", score: 0, status: "missing", available: 0, expected: 2, detail: "0/2 项可用" },
      { id: "chain", label: "产业链位置", score: 0, status: "missing", available: 0, expected: 1, detail: "0/1 项可用" },
      { id: "financial", label: "财务估值", score: 0, status: "missing", available: 0, expected: 6, detail: "0/6 项可用" },
      { id: "research", label: "研究判断", score: 0, status: "missing", available: 0, expected: 6, detail: "0/6 项可用" },
    ],
    criticalIssues: [],
    assessedAt: "",
  };
}

function formatFinancialMetric(value: number | null, unit: string) {
  if (value === null) return "待补";
  const precision = Math.abs(value) >= 100 ? 0 : 2;
  const formatted = precision === 0 ? value.toFixed(0) : value.toFixed(precision).replace(/\.?0+$/, "");
  return `${formatted}${unit}`;
}

function formatYuanAmount(value: number | null) {
  if (value === null) return "待补";
  const absolute = Math.abs(value);
  if (absolute >= 100_000_000) return `${(value / 100_000_000).toFixed(2).replace(/\.?0+$/, "")}亿元`;
  if (absolute >= 10_000) return `${(value / 10_000).toFixed(2).replace(/\.?0+$/, "")}万元`;
  return `${value.toFixed(0)}元`;
}

function formatRatioMetric(value: number | null) {
  return value === null ? "待补" : `${(value * 100).toFixed(2).replace(/\.?0+$/, "")}%`;
}

function getBusinessSegmentsFromFacts(
  fieldFacts: CompanyFieldFact[],
): ReturnType<typeof buildCompanyResearchDetail>["businessSegments"] | null {
  const rows = getObjectArrayFieldFact(fieldFacts, "businessComposition");
  const segments = rows.flatMap((row) => {
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (!name) return [];
    const revenueRatio = finiteNumber(row.revenueRatio);
    const grossMargin = finiteNumber(row.grossMargin);
    return [{
      name,
      exposure: businessExposure(revenueRatio),
      revenueRatio: revenueRatio ?? undefined,
      grossMargin: grossMargin ?? undefined,
      note: `收入占比：${revenueRatio === null ? "待补" : `${revenueRatio}%`}；毛利率：${grossMargin === null ? "待补" : `${grossMargin}%`}`,
    }];
  });
  return segments.length > 0 ? segments : null;
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function businessExposure(value: number | null): ReturnType<typeof buildCompanyResearchDetail>["businessSegments"][number]["exposure"] {
  if (value === null) return "待确认";
  if (value >= 50) return "高";
  if (value >= 30) return "较高";
  if (value >= 10) return "中";
  return "低";
}

function buildDisclosureEvents(fieldFacts: CompanyFieldFact[]) {
  const announcements = getObjectArrayFieldFact(fieldFacts, "announcements").map((item) => ({
    kind: "公告",
    title: typeof item.title === "string" ? item.title : "",
    date: typeof item.date === "string" ? item.date : "",
  }));
  const reports = getObjectArrayFieldFact(fieldFacts, "researchReports").map((item) => ({
    kind: "研报",
    title: typeof item.title === "string" ? item.title : "",
    date: typeof item.publishDate === "string" ? item.publishDate : "",
  }));
  return [...announcements, ...reports]
    .filter((item) => item.title)
    .sort((left, right) => right.date.localeCompare(left.date));
}

function getObjectArrayFieldFact(fieldFacts: CompanyFieldFact[], fieldKey: string) {
  const fact = getBestFieldFact(fieldFacts, fieldKey);
  if (!Array.isArray(fact?.value)) return [];
  return fact.value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
}

function getOverallState(
  backgroundSyncStatus: BackgroundSyncStatus | undefined,
  latestSyncTask: SyncTask | null,
  evidenceCount: number,
  hasPendingRationale: boolean,
) {
  if (backgroundSyncStatus?.state === "syncing") {
    return { label: "正在补全", message: backgroundSyncStatus.message, tone: "syncing" as const };
  }
  if (backgroundSyncStatus?.state === "failed") {
    return { label: "需处理", message: backgroundSyncStatus.message, tone: "failed" as const };
  }
  if (backgroundSyncStatus?.state === "done") {
    return { label: "刚刚补全", message: backgroundSyncStatus.message, tone: "good" as const };
  }
  if (latestSyncTask?.status === "running" || latestSyncTask?.status === "pending") {
    return { label: "正在补全", message: latestSyncTask.message || "深度资料后台同步中", tone: "syncing" as const };
  }
  if (latestSyncTask?.status === "partial") {
    return { label: "部分完成", message: latestSyncTask.message || "部分数据源暂时不可用", tone: "pending" as const };
  }
  if (evidenceCount > 0) {
    return { label: "已有证据", message: "已沉淀可追溯资料", tone: "good" as const };
  }
  if (hasPendingRationale) {
    return { label: "基础入库", message: "已保存标的，等待证据补全", tone: "pending" as const };
  }
  return { label: "待补全", message: "建议同步资料或补充证据", tone: "pending" as const };
}

function isPendingRationale(rationale: string) {
  return /后台同步|基础资料|待验证|未挂证据|补充公告|补充.*证据/.test(rationale);
}

function syncStatusLabel(status: SyncTask["status"]) {
  if (status === "running") return "同步中";
  if (status === "partial") return "部分完成";
  if (status === "success") return "已完成";
  if (status === "failed") return "失败";
  return "排队中";
}

function buildSyncPresentation(
  task: SyncTask | null,
  snapshots: CompanySourceSnapshot[],
  syncError: string,
) {
  const successfulSources = snapshots.filter((snapshot) => sourceSnapshotTone(snapshot.status) === "success").length;
  const failedSources = snapshots.filter((snapshot) => sourceSnapshotTone(snapshot.status) === "failed").length;
  const partial = successfulSources > 0 && failedSources > 0;

  if (syncError || task?.status === "failed") {
    return {
      visible: true,
      tone: "error",
      label: "补全未完成",
      message: syncError || task?.error || task?.message || "数据源暂时不可用，可点击重试",
      actionLabel: "重试补全",
      successfulSources,
    };
  }
  if (task?.status === "pending" || task?.status === "running") {
    return {
      visible: true,
      tone: "syncing",
      label: task.status === "pending" ? "等待补全" : "正在补全",
      message: task.message || "基础资料已可用，深度资料正在后台整理",
      actionLabel: "正在补全",
      successfulSources,
    };
  }
  if (task?.status === "success" || task?.status === "partial") {
    return {
      visible: true,
      tone: task.status === "partial" || partial ? "partial" : "success",
      label: task.status === "partial" || partial ? "资料部分可用" : "资料已就绪",
      message: task.status === "partial" || partial
        ? `${successfulSources} 个来源已完成，${failedSources} 个来源暂时不可用`
        : task.message || "结构化资料和证据已经更新",
      actionLabel: "重新补全",
      successfulSources,
    };
  }
  return {
    visible: snapshots.length > 0,
    tone: partial ? "partial" : "success",
    label: partial ? "资料部分可用" : "资料已就绪",
    message: partial ? `${successfulSources} 个来源已完成，${failedSources} 个来源暂时不可用` : "本地资料已就绪",
    actionLabel: "同步资料",
    successfulSources,
  };
}

function sourceSnapshotTone(status: string) {
  const normalized = status.toLowerCase();
  if (["success", "completed", "available", "ready"].includes(normalized)) return "success";
  if (["failed", "error", "unavailable", "timeout"].includes(normalized)) return "failed";
  return "pending";
}

function sourceSnapshotLabel(status: string) {
  const tone = sourceSnapshotTone(status);
  if (tone === "success") return "可用";
  if (tone === "failed") return "暂不可用";
  return "处理中";
}

function briefStatusClass(tone: StateTone) {
  const base = "inline-flex h-7 shrink-0 items-center rounded-full border px-2.5 text-xs font-semibold";
  if (tone === "good") return `${base} border-emerald-200 bg-emerald-50 text-emerald-700`;
  if (tone === "syncing") return `${base} border-cyan-200 bg-cyan-50 text-cyan-700`;
  if (tone === "failed") return `${base} border-rose-200 bg-rose-50 text-rose-700`;
  return `${base} border-amber-200 bg-amber-50 text-amber-700`;
}
