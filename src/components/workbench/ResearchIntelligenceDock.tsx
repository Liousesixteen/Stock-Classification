"use client";

import {
  BarChart3,
  BookOpenCheck,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Gauge,
  Globe2,
  LoaderCircle,
  MessageSquarePlus,
  Network,
  Paperclip,
  Quote,
  Search,
  Send,
  Settings2,
  Share2,
  ShieldAlert,
  Sparkles,
  Square,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { getDAStockToolName, type DAStockResearchTool } from "@/lib/agents/daStockResearchTools";
import type { DeepResearchResult, ResearchAgentStage } from "@/lib/agents/deepseekResearchAgent";
import type { ResearchCitation } from "@/lib/research/researchEvidenceCatalog";
import type { ResearchAnswerBlock } from "@/lib/research/researchPlanning";
import { inferResearchSkillIds, RESEARCH_SKILLS, type ResearchSkill } from "@/lib/agents/researchSkills";
import type { ResearchProgressEvent } from "@/lib/research/researchProgress";
import type { ReportGenerationProgress } from "@/lib/research/reportGenerationProgress";
import type { ResearchReportEngine } from "@/lib/finsight/runtime";
import { inferFinSightReportPlan } from "@/lib/finsight/reportPlanner";
import { inferMarketResearchTarget, inferStandaloneStockQuery } from "@/lib/research/researchTarget";
import {
  RESEARCH_SOURCE_SCENARIOS,
  RESEARCH_SOURCE_TIERS,
  RESEARCH_SOURCE_TYPES,
  inferResearchSourceScenario,
  type ResearchSourceTierId,
} from "@/lib/research/researchSourceDirectory";
import type {
  ResearchConversationMessage,
  ResearchConversationSession,
  StoredResearchRun,
  StoredUniversalResearchRun,
} from "@/lib/repositories/aiResearch";
import type {
  ResearchDocumentVersion,
  ResearchReportType,
  StoredResearchDocument,
} from "@/lib/repositories/researchDocuments";
import { ReportWritingWorkspace } from "./ReportWritingWorkspace";

export type IntelligenceTab = "agents" | "report";

type ResearchIntelligenceDockProps = {
  stockCode: string | null;
  companyName: string;
  categoryId: number | null;
  relationId?: number | null;
  isWatchlist?: boolean;
  categoryName?: string;
  tab: IntelligenceTab;
  onTabChange: (tab: IntelligenceTab) => void;
  onClose: () => void;
  embedded?: boolean;
  onTargetChange?: (target: IntelligenceTarget | null) => void;
};

export type IntelligenceTarget = {
  targetType: "company" | "industry" | "question";
  subjectKey: string;
  stockCode: string;
  companyName: string;
  board: string;
  industry: string;
  categoryId: number | null;
  relationId?: number | null;
  isWatchlist?: boolean;
  availableEvidenceCount?: number;
};

type LookupPayload = {
  profile?: {
    stockCode: string;
    shortName: string;
    board: string;
    industry: string;
    categoryId?: number | null;
    categoryName?: string;
    relationId?: number | null;
    isWatchlist?: boolean;
    availableEvidenceCount?: number;
  };
  error?: string;
};

type CategoryLookupNode = {
  id: number;
  name: string;
  aliases: string[];
  industry: string;
  children: CategoryLookupNode[];
};

type ResearchProviderStatus = {
  provider: string;
  kind: string;
  markets: string[];
  runtime: string;
  enabled: boolean;
  configuredKeys: string[];
};

type ResearchProviderReadiness = {
  configured: boolean;
  providerCount: number;
  enabledCount: number;
  providers: ResearchProviderStatus[];
  error: string;
};

const ROLE_PREVIEW = ["基本面 Agent", "产业链 Agent", "情报 Agent", "风险 Agent", "主审 Agent"];
const ACTIVE_RESEARCH_SESSION_KEY = "stock-classification.ai-research.active-session";
const CONTEXT_COMPRESSION_KEY = "stock-classification.ai-research.context-compression";
const RECENT_SESSION_RESTORE_WINDOW_MS = 30 * 60 * 1_000;
type ResearchRun = StoredResearchRun | StoredUniversalResearchRun;

export function chooseResearchSessionToRestore(
  sessions: ResearchConversationSession[],
  savedSessionId: string | null,
  stockCode: string | null,
) {
  const eligibleSessions = sessions.filter((session) => session.integrityStatus !== "legacy_target_mismatch");
  const newestSession = eligibleSessions[0] ?? null;
  const savedSession = eligibleSessions.find((session) => session.sessionId === savedSessionId);
  const targetSession = eligibleSessions.find((session) => stockCode && session.stockCode === stockCode);
  const preferredSession = savedSession ?? targetSession;
  if (!newestSession || !preferredSession) return preferredSession ?? newestSession;

  const newestUpdatedAt = Date.parse(newestSession.updatedAt.replace(" ", "T"));
  const preferredUpdatedAt = Date.parse(preferredSession.updatedAt.replace(" ", "T"));
  const ageBehindNewest = newestUpdatedAt - preferredUpdatedAt;
  if (Number.isFinite(ageBehindNewest) && ageBehindNewest <= RECENT_SESSION_RESTORE_WINDOW_MS) {
    return preferredSession;
  }
  return newestSession;
}

export function ResearchIntelligenceDock({ stockCode, companyName, categoryId, categoryName = "", tab, onTabChange, onClose, embedded = false, onTargetChange }: ResearchIntelligenceDockProps) {
  const [targetQuery, setTargetQuery] = useState(companyName || stockCode || "");
  const [target, setTarget] = useState<IntelligenceTarget | null>(stockCode ? {
    targetType: "company",
    subjectKey: stockCode,
    stockCode,
    companyName: companyName || stockCode,
    board: "",
    industry: categoryName,
    categoryId,
  } : null);
  const [resolvingTarget, setResolvingTarget] = useState(false);
  const [question, setQuestion] = useState("");
  const [depth, setDepth] = useState<"quick" | "standard" | "deep">("standard");
  const [run, setRun] = useState<ResearchRun | null>(null);
  const [report, setReport] = useState<StoredResearchDocument | null>(null);
  const [reportHistory, setReportHistory] = useState<StoredResearchDocument[]>([]);
  const [versions, setVersions] = useState<ResearchDocumentVersion[]>([]);
  const [running, setRunning] = useState(false);
  const [writing, setWriting] = useState(false);
  const [savingReport, setSavingReport] = useState(false);
  const [rewritingReport, setRewritingReport] = useState(false);
  const [reportProgress, setReportProgress] = useState<ReportGenerationProgress[]>([]);
  const [activeRole, setActiveRole] = useState(0);
  const [error, setError] = useState("");
  const [reportType, setReportType] = useState<ResearchReportType>("company");
  const [reportEngine, setReportEngine] = useState<ResearchReportEngine>("finsight");
  const [finSightAvailability, setFinSightAvailability] = useState<{ available: boolean; missing: string[] } | null>(null);
  const [focus, setFocus] = useState("");
  const [comparisonCodes, setComparisonCodes] = useState("");
  const [sessionId, setSessionId] = useState(createResearchSessionId);
  const [sessions, setSessions] = useState<ResearchConversationSession[]>([]);
  const [conversationMessages, setConversationMessages] = useState<ResearchConversationMessage[]>([]);
  // A new conversation starts as general research. A strategy is
  // activated only when the user selects it or names it in the question.
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [contextCompressionEnabled, setContextCompressionEnabled] = useState(false);
  const [researchSkills, setResearchSkills] = useState<ResearchSkill[]>(RESEARCH_SKILLS);
  const [researchTools, setResearchTools] = useState<DAStockResearchTool[]>([]);
  const [providerReadiness, setProviderReadiness] = useState<ResearchProviderReadiness | null>(null);
  const [pendingResearchContext, setPendingResearchContext] = useState<Record<string, unknown>>({});
  const [progressEvents, setProgressEvents] = useState<ResearchProgressEvent[]>([]);
  const [submittedQuestion, setSubmittedQuestion] = useState("");
  const [sessionQuarantined, setSessionQuarantined] = useState(false);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const sessionHydratedRef = React.useRef(false);
  const sessionQuarantinedRef = React.useRef(false);
  const sessionSwitchTokenRef = React.useRef(0);
  const inferredTargetUpdateRef = React.useRef(false);

  const loadReportHistory = React.useCallback(async () => {
    const response = await fetch("/api/ai/reports?scope=history");
    if (!response.ok) return;
    const payload = await response.json() as { reports?: StoredResearchDocument[] };
    setReportHistory(payload.reports ?? []);
  }, []);

  useEffect(() => {
    try {
      setContextCompressionEnabled(window.localStorage.getItem(CONTEXT_COMPRESSION_KEY) === "true");
    } catch {
      setContextCompressionEnabled(false);
    }
  }, []);

  useEffect(() => {
    if (!embedded || tab !== "report") return;
    const controller = new AbortController();
    void fetch("/api/ai/reports/engine", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((payload: { defaultEngine?: ResearchReportEngine; engines?: { finsight?: { available?: boolean; missing?: string[] } } } | null) => {
        const status = payload?.engines?.finsight;
        if (!status) return;
        setFinSightAvailability({ available: status.available === true, missing: status.missing ?? [] });
        setReportEngine(status.available ? "finsight" : "native");
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [embedded, tab]);

  useEffect(() => {
    if (!embedded || tab !== "report") return;
    void loadReportHistory();
  }, [embedded, loadReportHistory, tab]);

  const updateContextCompression = (enabled: boolean) => {
    setContextCompressionEnabled(enabled);
    try {
      window.localStorage.setItem(CONTEXT_COMPRESSION_KEY, String(enabled));
    } catch {
      // Keep the preference for the current tab when storage is unavailable.
    }
  };

  useEffect(() => {
    if (!stockCode) return;
    const nextTarget = {
      targetType: "company" as const,
      subjectKey: stockCode,
      stockCode,
      companyName: companyName || stockCode,
      board: "",
      industry: categoryName,
      categoryId,
    };
    setTarget(nextTarget);
    setTargetQuery(companyName || stockCode);
    setReportType("company");
    onTargetChange?.(nextTarget);
  }, [categoryId, categoryName, companyName, onTargetChange, stockCode]);

  useEffect(() => {
    if (target?.targetType !== "company" || target.relationId !== undefined) return;
    let active = true;
    fetch(`/api/stocks/lookup?mode=quick&query=${encodeURIComponent(target.stockCode)}`)
      .then((response) => response.ok ? response.json() : null)
      .then((payload: LookupPayload | null) => {
        if (!active || !payload?.profile || payload.profile.stockCode !== target.stockCode) return;
        setTarget((current) => current?.stockCode === target.stockCode ? {
          ...current,
          companyName: payload.profile?.shortName || current.companyName,
          board: payload.profile?.board || current.board,
          industry: payload.profile?.categoryName || payload.profile?.industry || current.industry,
          categoryId: payload.profile?.categoryId ?? current.categoryId,
          relationId: payload.profile?.relationId ?? null,
          isWatchlist: payload.profile?.isWatchlist ?? false,
          availableEvidenceCount: payload.profile?.availableEvidenceCount ?? 0,
        } : current);
      });
    return () => { active = false; };
  }, [target]);

  useEffect(() => {
    if (inferredTargetUpdateRef.current) {
      inferredTargetUpdateRef.current = false;
      return;
    }
    // Target inference can finish before a fast streamed response. Do not let
    // the target-change loader erase an in-flight result from that same turn.
    if (abortControllerRef.current) return;
    setRun(null);
    if (sessionQuarantinedRef.current) return;
    setError("");
    if (!target) return;
    const researchUrl = target.targetType === "company"
      ? `/api/ai/research?stockCode=${target.stockCode}`
      : `/api/ai/research?subjectType=${target.targetType}&subjectKey=${encodeURIComponent(target.subjectKey)}`;
    fetch(researchUrl).then((response) => response.ok ? response.json() : null).then((researchPayload) => {
      setRun((researchPayload?.run as StoredResearchRun | null) ?? null);
    });
  }, [target]);

  useEffect(() => {
    setReport(null);
    setVersions([]);
    const subjectKey = reportSubjectKey(target, reportType, comparisonCodes);
    if (!subjectKey) return;
    fetch(`/api/ai/reports?reportType=${reportType}&subjectKey=${encodeURIComponent(subjectKey)}`)
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        setReport((payload?.report as StoredResearchDocument | null) ?? null);
        setVersions((payload?.versions as ResearchDocumentVersion[] | undefined) ?? []);
      });
  }, [comparisonCodes, reportType, target]);

  useEffect(() => {
    if (tab !== "report") return;
    setReportType(inferFinSightReportPlan({
      question: focus,
      targetType: target?.targetType,
      stockCode: target?.stockCode,
      comparisonCodes: parseComparisonCodes(comparisonCodes),
    }).reportType);
  }, [comparisonCodes, focus, tab, target?.stockCode, target?.targetType]);

  const loadSessions = React.useCallback(async () => {
    const response = await fetch("/api/ai/research/sessions");
    if (!response.ok) return;
    const payload = await response.json() as { sessions?: ResearchConversationSession[] };
    setSessions(payload.sessions ?? []);
  }, []);

  useEffect(() => {
    void loadSessions();
    let cancelled = false;
    void fetch("/api/ai/research/skills")
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (!cancelled) setResearchSkills((payload?.skills as ResearchSkill[] | undefined) ?? RESEARCH_SKILLS);
      })
      .catch(() => {
        if (!cancelled) setResearchSkills(RESEARCH_SKILLS);
      });
    void fetch("/api/ai/research/tools")
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (!cancelled) setResearchTools((payload?.tools as DAStockResearchTool[] | undefined) ?? []);
      })
      .catch(() => {
        if (!cancelled) setResearchTools([]);
      });
    void fetch("/api/ai/research/providers")
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (!cancelled) setProviderReadiness((payload as ResearchProviderReadiness | null) ?? null);
      })
      .catch(() => {
        if (!cancelled) setProviderReadiness(null);
      });
    return () => {
      cancelled = true;
    };
  }, [loadSessions]);

  const result = run?.result ?? null;
  const completedRoles = useMemo(() => result?.stages.length ?? 0, [result]);

  const resolveTarget = async () => {
    const query = targetQuery.trim();
    if (!query) {
      setError("请输入股票代码或公司简称");
      return;
    }
    setResolvingTarget(true);
    setError("");
    try {
      const response = await fetch(`/api/stocks/lookup?mode=quick&query=${encodeURIComponent(query)}`);
      const payload = (await response.json().catch(() => ({}))) as LookupPayload;
      if (!response.ok || !payload.profile) throw new Error(payload.error ?? "没有匹配到 A 股公司");
      const nextTarget: IntelligenceTarget = {
        targetType: "company",
        subjectKey: payload.profile.stockCode,
        stockCode: payload.profile.stockCode,
        companyName: payload.profile.shortName || payload.profile.stockCode,
        board: payload.profile.board,
        industry: payload.profile.categoryName || payload.profile.industry,
        categoryId: payload.profile.categoryId ?? (payload.profile.stockCode === stockCode ? categoryId : null),
        relationId: payload.profile.relationId ?? null,
        isWatchlist: payload.profile.isWatchlist ?? false,
        availableEvidenceCount: payload.profile.availableEvidenceCount ?? 0,
      };
      setTarget(nextTarget);
      setTargetQuery(nextTarget.companyName);
      setReportType("company");
      onTargetChange?.(nextTarget);
    } catch {
      try {
        const response = await fetch("/api/categories");
        const payload = (await response.json()) as { categories?: CategoryLookupNode[] };
        const category = flattenCategories(payload.categories ?? []).find((item) =>
          item.name.toLocaleLowerCase() === query.toLocaleLowerCase()
          || item.aliases.some((alias) => alias.toLocaleLowerCase() === query.toLocaleLowerCase()),
        );
        const nextTarget: IntelligenceTarget = category ? {
          targetType: "industry",
          subjectKey: String(category.id),
          stockCode: "",
          companyName: category.name,
          board: "",
          industry: category.industry || category.name,
          categoryId: category.id,
        } : {
          targetType: "question",
          subjectKey: questionKey(query),
          stockCode: "",
          companyName: query,
          board: "",
          industry: "开放研究",
          categoryId: null,
        };
        setTarget(nextTarget);
        setTargetQuery(nextTarget.companyName);
        setReportType(nextTarget.targetType === "industry" ? "industry" : "event");
        onTargetChange?.(nextTarget);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "研究目标识别失败");
      }
    } finally {
      setResolvingTarget(false);
    }
  };

  const launchResearch = async (override: { prompt?: string; skills?: string[] } = {}) => {
    const prompt = (override.prompt ?? question).trim();
    const inferredSkills = inferResearchSkillIds(prompt);
    const effectiveSkills = override.skills ?? (inferredSkills.length > 0 ? inferredSkills : selectedSkills);
    if (!prompt || running) return;
    let effectiveTarget = target ?? {
      targetType: "question" as const,
      subjectKey: questionKey(prompt),
      stockCode: "",
      companyName: prompt.slice(0, 80) || "开放研究问题",
      board: "",
      industry: "开放研究",
      categoryId: null,
    };
    let effectiveSessionId = sessionId;
    const marketResearch = inferMarketResearchTarget(prompt);
    const externalSecurity = inferExternalSecurityQuery(prompt);
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setRunning(true);
    setActiveRole(0);
    setProgressEvents([{
      type: "thinking",
      step: 1,
      message: "正在识别问题与研究标的",
      createdAt: new Date().toISOString(),
    }]);
    setSubmittedQuestion(prompt);
    setQuestion("");
    if (override.skills || inferredSkills.length > 0) setSelectedSkills(effectiveSkills);
    setError("");
    try {
      const inferredQuery = externalSecurity || marketResearch ? "" : inferStandaloneStockQuery(prompt);
      const lookupQuery = inferredQuery || prompt;
      const lookupMode = inferredQuery ? "quick" : "mention";
      const lookupResponse = externalSecurity || marketResearch
        ? null
        : await fetch(`/api/stocks/lookup?mode=${lookupMode}&query=${encodeURIComponent(lookupQuery)}`, { signal: controller.signal });
      let lookupPayload = lookupResponse
        ? (await lookupResponse.json().catch(() => ({}))) as LookupPayload
        : {};
      let resolvedLookupResponse = lookupResponse;
      if (resolvedLookupResponse && !resolvedLookupResponse.ok && inferredQuery) {
        resolvedLookupResponse = await fetch(`/api/stocks/lookup?mode=mention&query=${encodeURIComponent(prompt)}`, { signal: controller.signal });
        lookupPayload = (await resolvedLookupResponse.json().catch(() => ({}))) as LookupPayload;
      }
      let inferredIndustry: CategoryLookupNode | null = null;
      if (!externalSecurity && !marketResearch && !(resolvedLookupResponse?.ok && lookupPayload.profile)) {
        const categoryResponse = await fetch("/api/categories", { signal: controller.signal }).catch((reason) => {
          if (controller.signal.aborted) throw reason;
          return null;
        });
        if (categoryResponse?.ok) {
          const categoryPayload = (await categoryResponse.json().catch(() => ({}))) as { categories?: CategoryLookupNode[] };
          inferredIndustry = findCategoryMention(categoryPayload.categories ?? [], prompt);
        }
      }
      if (marketResearch) {
        const marketTarget: IntelligenceTarget = {
          targetType: "question",
          subjectKey: marketResearch.key,
          stockCode: "",
          companyName: marketResearch.label,
          board: "A股",
          industry: "市场研究",
          categoryId: null,
        };
        if (target?.subjectKey !== marketTarget.subjectKey) {
          effectiveTarget = marketTarget;
          effectiveSessionId = createResearchSessionId();
          sessionSwitchTokenRef.current += 1;
          inferredTargetUpdateRef.current = true;
          setTarget(marketTarget);
          setTargetQuery(marketTarget.companyName);
          setReportType("event");
          setSessionId(effectiveSessionId);
          setConversationMessages([]);
          setRun(null);
          onTargetChange?.(marketTarget);
          setProgressEvents((current) => [...current, {
            type: "thinking",
            step: 1,
            message: "识别到A股大盘问题，已脱离个股上下文并调用市场工具",
            createdAt: new Date().toISOString(),
          }]);
        }
      } else if (externalSecurity) {
        const externalTarget: IntelligenceTarget = {
          targetType: "question",
          subjectKey: `security-${externalSecurity.market.toLowerCase()}-${externalSecurity.code}`,
          stockCode: "",
          companyName: externalSecurity.label,
          board: externalSecurity.market,
          industry: "跨市场开放研究",
          categoryId: null,
        };
        if (target?.subjectKey !== externalTarget.subjectKey) {
          effectiveTarget = externalTarget;
          effectiveSessionId = createResearchSessionId();
          sessionSwitchTokenRef.current += 1;
          inferredTargetUpdateRef.current = true;
          setTarget(externalTarget);
          setTargetQuery(externalTarget.companyName);
          setReportType("event");
          setSessionId(effectiveSessionId);
          setConversationMessages([]);
          setRun(null);
          onTargetChange?.(externalTarget);
          setProgressEvents((current) => [...current, {
            type: "thinking",
            step: 1,
            message: `识别到跨市场标的 ${externalTarget.companyName}，已隔离当前 A 股上下文`,
            createdAt: new Date().toISOString(),
          }]);
        }
      } else if (resolvedLookupResponse?.ok && lookupPayload.profile) {
        const profile = lookupPayload.profile;
        const inferredTarget: IntelligenceTarget = {
          targetType: "company",
          subjectKey: profile.stockCode,
          stockCode: profile.stockCode,
          companyName: profile.shortName || profile.stockCode,
          board: profile.board,
          industry: profile.categoryName || profile.industry,
          categoryId: profile.categoryId ?? null,
          relationId: profile.relationId ?? null,
          isWatchlist: profile.isWatchlist ?? false,
        };
        if (target?.stockCode !== inferredTarget.stockCode) {
          effectiveTarget = inferredTarget;
          effectiveSessionId = createResearchSessionId();
          inferredTargetUpdateRef.current = true;
          setTarget(inferredTarget);
          setTargetQuery(inferredTarget.companyName);
          setReportType("company");
          setSessionId(effectiveSessionId);
          setConversationMessages([]);
          setRun(null);
          onTargetChange?.(inferredTarget);
          setProgressEvents((current) => [...current, {
            type: "thinking",
            step: 1,
            message: `识别到新标的 ${inferredTarget.companyName}（${inferredTarget.stockCode}），已开启独立会话`,
            createdAt: new Date().toISOString(),
          }]);
        }
      } else if (inferredIndustry) {
        const industryTarget: IntelligenceTarget = {
          targetType: "industry",
          subjectKey: String(inferredIndustry.id),
          stockCode: "",
          companyName: inferredIndustry.name,
          board: "",
          industry: inferredIndustry.industry || inferredIndustry.name,
          categoryId: inferredIndustry.id,
        };
        if (target?.subjectKey !== industryTarget.subjectKey || target.targetType !== "industry") {
          effectiveTarget = industryTarget;
          effectiveSessionId = createResearchSessionId();
          sessionSwitchTokenRef.current += 1;
          inferredTargetUpdateRef.current = true;
          setTarget(industryTarget);
          setTargetQuery(industryTarget.companyName);
          setReportType("industry");
          setSessionId(effectiveSessionId);
          setConversationMessages([]);
          setRun(null);
          onTargetChange?.(industryTarget);
          setProgressEvents((current) => [...current, {
            type: "thinking",
            step: 1,
            message: `识别到行业主题 ${industryTarget.companyName}，已加载产业链与行业数据源`,
            createdAt: new Date().toISOString(),
          }]);
        }
      } else if (!shouldContinueTargetContext(prompt, target, conversationMessages.length)) {
        const openTarget: IntelligenceTarget = {
          targetType: "question",
          subjectKey: questionKey(prompt),
          stockCode: "",
          companyName: prompt.slice(0, 48),
          board: "",
          industry: "开放金融研究",
          categoryId: null,
        };
        effectiveTarget = openTarget;
        if (target?.subjectKey !== openTarget.subjectKey || target.targetType !== "question") {
          effectiveSessionId = createResearchSessionId();
          sessionSwitchTokenRef.current += 1;
          inferredTargetUpdateRef.current = true;
          setTarget(openTarget);
          setTargetQuery(openTarget.companyName);
          setReportType("event");
          setSessionId(effectiveSessionId);
          setConversationMessages([]);
          setRun(null);
          onTargetChange?.(openTarget);
          setProgressEvents((current) => [...current, {
            type: "thinking",
            step: 1,
            message: "已按开放金融问题建立独立研究上下文",
            createdAt: new Date().toISOString(),
          }]);
        }
      }
      if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
      if (!target && effectiveTarget.targetType === "question") {
        inferredTargetUpdateRef.current = true;
        setTarget(effectiveTarget);
      }
      const response = await fetch("/api/ai/research/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          targetType: effectiveTarget.targetType,
          subjectKey: effectiveTarget.subjectKey,
          subjectLabel: effectiveTarget.companyName,
          stockCode: effectiveTarget.stockCode,
          categoryId: effectiveTarget.categoryId,
          question: prompt,
          depth,
          sessionId: effectiveSessionId,
          skills: effectiveSkills,
          contextCompression: contextCompressionEnabled,
          context: {
            ...pendingResearchContext,
            ...(externalSecurity ? { externalSecurity: {
              market: externalSecurity.market.toLowerCase(),
              symbol: externalSecurity.code,
              label: externalSecurity.label,
            } } : {}),
            ...(marketResearch ? { marketResearch: {
              market: marketResearch.market,
              label: marketResearch.label,
            } } : {}),
          },
        }),
      });
      setPendingResearchContext({});
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error ?? "AI 研究流连接失败");
      }
      if (!response.body) throw new Error("AI 研究流连接失败");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completedPayload: { sessionId?: string; run?: ResearchRun } | null = null;
      let streamError: unknown = null;
      let receivedServerError = false;
      try {
        while (true) {
          const { done, value } = await reader.read();
          buffer += decoder.decode(value, { stream: !done });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";
          for (const frame of frames) {
            const dataLine = frame.split("\n").find((line) => line.startsWith("data: "));
            if (!dataLine) continue;
            const event = JSON.parse(dataLine.slice(6)) as {
              type: "progress" | "done" | "error" | "heartbeat";
              event?: ResearchProgressEvent;
              sessionId?: string;
              run?: ResearchRun;
              message?: string;
            };
            if (event.type === "progress" && event.event) {
              setProgressEvents((current) => current.length === 1
                && current[0].message === "正在识别问题与研究标的"
                ? [event.event!]
                : [...current, event.event!]);
              if (event.event.type === "agent_start" && event.event.displayName) {
                const startedRoles = new Set(
                  progressEvents
                    .filter((item) => item.type === "agent_start" && item.displayName)
                    .map((item) => item.displayName),
                );
                startedRoles.add(event.event.displayName);
                setActiveRole(Math.max(0, startedRoles.size - 1));
              }
            } else if (event.type === "done" && event.run) {
              completedPayload = { sessionId: event.sessionId, run: event.run };
            } else if (event.type === "error") {
              receivedServerError = true;
              throw new Error(event.message ?? "AI 团队研究失败");
            }
          }
          if (done) break;
        }
      } catch (reason) {
        streamError = reason;
      }
      if (!completedPayload?.run && !receivedServerError && !controller.signal.aborted) {
        setProgressEvents((current) => [...current, {
          type: "thinking",
          step: Math.max(2, current.at(-1)?.step ?? 2),
          message: "实时连接已中断，正在从后台恢复研究结果",
          createdAt: new Date().toISOString(),
        }]);
        completedPayload = await recoverCompletedResearch(
          effectiveSessionId,
          effectiveTarget,
          prompt,
          depth,
          controller.signal,
        );
      }
      if (!completedPayload?.run) {
        if (streamError) throw streamError;
        throw new Error("实时连接已中断，后台暂未返回结果；会话已保留，可稍后点击恢复");
      }
      setRun(completedPayload.run);
      if (completedPayload.sessionId) {
        setSessionId(completedPayload.sessionId);
        window.localStorage.setItem(ACTIVE_RESEARCH_SESSION_KEY, completedPayload.sessionId);
      }
      const activeSessionId = completedPayload.sessionId || effectiveSessionId;
      const sessionResponse = await fetch(`/api/ai/research/sessions/${encodeURIComponent(activeSessionId)}`);
      if (sessionResponse.ok) {
        const sessionPayload = await sessionResponse.json() as { messages?: ResearchConversationMessage[] };
        setConversationMessages(sessionPayload.messages ?? []);
      }
      await loadSessions();
    } catch (reason) {
      if (controller.signal.aborted || (reason instanceof Error && reason.name === "AbortError")) {
        setError("本次研究已停止，可修改问题后重新发起");
        setQuestion(prompt);
      } else {
        setError(reason instanceof Error ? reason.message : "AI 团队研究失败");
        setQuestion(prompt);
      }
      const failedSessionResponse = await fetch(`/api/ai/research/sessions/${encodeURIComponent(effectiveSessionId)}`, {
        cache: "no-store",
      }).catch(() => null);
      if (failedSessionResponse?.ok) {
        const failedSessionPayload = await failedSessionResponse.json() as { messages?: ResearchConversationMessage[] };
        setConversationMessages(failedSessionPayload.messages ?? []);
        window.localStorage.setItem(ACTIVE_RESEARCH_SESSION_KEY, effectiveSessionId);
      }
      await loadSessions();
    } finally {
      if (abortControllerRef.current === controller) abortControllerRef.current = null;
      setRunning(false);
      setSubmittedQuestion("");
    }
  };

  const startNewResearchSession = () => {
    abortControllerRef.current?.abort();
    sessionSwitchTokenRef.current += 1;
    window.localStorage.removeItem(ACTIVE_RESEARCH_SESSION_KEY);
    setSessionId(createResearchSessionId());
    setConversationMessages([]);
    setRun(null);
    setProgressEvents([]);
    setSubmittedQuestion("");
    setQuestion("");
    setSelectedSkills([]);
    setError("");
    sessionQuarantinedRef.current = false;
    setSessionQuarantined(false);
    setPendingResearchContext({});
    setTarget(null);
    setTargetQuery("");
    onTargetChange?.(null);
  };

  const switchResearchSession = React.useCallback(async (nextSessionId: string) => {
    abortControllerRef.current?.abort();
    const switchToken = sessionSwitchTokenRef.current + 1;
    sessionSwitchTokenRef.current = switchToken;
    setError("");
    sessionQuarantinedRef.current = false;
    setSessionQuarantined(false);
    const response = await fetch(`/api/ai/research/sessions/${encodeURIComponent(nextSessionId)}`);
    const payload = await response.json().catch(() => null) as {
      session?: ResearchConversationSession;
      messages?: ResearchConversationMessage[];
      execution?: { active: boolean; startedAt: string };
      error?: string;
    } | null;
    if (switchToken !== sessionSwitchTokenRef.current) return;
    if (!response.ok || !payload?.session) {
      setError(payload?.error ?? "研究会话载入失败");
      return;
    }
    const session = payload.session;
    const messages = payload.messages ?? [];
    setSessionId(session.sessionId);
    window.localStorage.setItem(ACTIVE_RESEARCH_SESSION_KEY, session.sessionId);
    setQuestion("");
    setDepth(session.depth === "quick" || session.depth === "deep" ? session.depth : "standard");
    setSelectedSkills(session.skills);
    if (typeof session.context?.contextCompression === "boolean") {
      setContextCompressionEnabled(session.context.contextCompression);
      window.localStorage.setItem(CONTEXT_COMPRESSION_KEY, String(session.context.contextCompression));
    }
    setProgressEvents([]);
    setSubmittedQuestion("");
    const latestResultCandidate = [...messages].reverse().find((message) => message.role === "assistant" && message.metadata.result)?.metadata.result ?? null;
    const latestUserPrompt = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
    const firstUserPrompt = messages.find((message) => message.role === "user")?.content ?? "";
    const invalidGreetingSession = isGreetingPrompt(session.title) || isGreetingPrompt(firstUserPrompt);
    const latestResult = invalidGreetingSession ? null : latestResultCandidate;
    setConversationMessages(invalidGreetingSession ? [] : messages);
    setRun(latestResult ? researchRunFromSessionResult(session, latestUserPrompt, latestResult) : null);
    const nextTarget: IntelligenceTarget = {
      targetType: session.targetType,
      subjectKey: session.subjectKey,
      stockCode: session.stockCode,
      companyName: session.subjectLabel,
      board: "",
      industry: session.targetType === "industry" ? session.subjectLabel : "",
      categoryId: session.categoryId,
    };
    if (invalidGreetingSession) {
      sessionQuarantinedRef.current = true;
      setSessionQuarantined(true);
    }
    setTarget(nextTarget);
    setTargetQuery(session.subjectLabel);
    if (!invalidGreetingSession) onTargetChange?.(nextTarget);
    if (invalidGreetingSession && latestResultCandidate) {
      setError("检测到这是一条修复前由寒暄触发的异常会话，旧结论已自动隔离。请新建会话后输入明确研究问题。");
    }
    const inferredQuery = inferStandaloneStockQuery(latestUserPrompt);
    if (!invalidGreetingSession && session.targetType === "company" && inferredQuery) {
      const lookupResponse = await fetch(`/api/stocks/lookup?mode=quick&query=${encodeURIComponent(inferredQuery)}`);
      const lookupPayload = (await lookupResponse.json().catch(() => ({}))) as LookupPayload;
      if (switchToken !== sessionSwitchTokenRef.current) return;
      if (lookupResponse.ok && lookupPayload.profile && lookupPayload.profile.stockCode !== session.stockCode) {
        setConversationMessages([]);
        setRun(null);
        setError(`检测到这是一条修复前的异常会话：会话标的是${session.subjectLabel}，最后问题却指向${lookupPayload.profile.shortName}。旧结论可能混入错误上下文，请新建会话后重新研究。`);
      }
    }
    if (!invalidGreetingSession && payload.execution?.active && !latestResult) {
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setRunning(true);
      setSubmittedQuestion(latestUserPrompt);
      setProgressEvents([{
        type: "thinking",
        step: 2,
        message: "检测到后台研究仍在执行，正在恢复进度与结果",
        createdAt: payload.execution.startedAt || new Date().toISOString(),
      }]);
      try {
        const recovered = await recoverCompletedResearch(
          session.sessionId,
          nextTarget,
          latestUserPrompt,
          session.depth === "quick" || session.depth === "deep" ? session.depth : "standard",
          controller.signal,
          60,
        );
        if (switchToken !== sessionSwitchTokenRef.current) return;
        if (!recovered?.run) {
          if (!controller.signal.aborted) setError("后台研究仍在执行，请稍后再次打开该会话");
          return;
        }
        setRun(recovered.run);
        const refreshed = await fetch(`/api/ai/research/sessions/${encodeURIComponent(session.sessionId)}`);
        if (refreshed.ok) {
          const refreshedPayload = await refreshed.json() as { messages?: ResearchConversationMessage[] };
          if (switchToken !== sessionSwitchTokenRef.current) return;
          setConversationMessages(refreshedPayload.messages ?? []);
        }
        await loadSessions();
      } finally {
        if (abortControllerRef.current === controller) abortControllerRef.current = null;
        setRunning(false);
        setSubmittedQuestion("");
      }
    }
  }, [loadSessions, onTargetChange]);

  useEffect(() => {
    if (sessionHydratedRef.current || sessions.length === 0) return;
    sessionHydratedRef.current = true;
    const savedSessionId = window.localStorage.getItem(ACTIVE_RESEARCH_SESSION_KEY);
    const sessionToRestore = chooseResearchSessionToRestore(sessions, savedSessionId, stockCode);
    if (sessionToRestore) void switchResearchSession(sessionToRestore.sessionId);
  }, [sessions, stockCode, switchResearchSession]);

  const stopResearch = async () => {
    const controller = abortControllerRef.current;
    try {
      await fetch(`/api/ai/research/sessions/${encodeURIComponent(sessionId)}/cancel`, {
        method: "POST",
      });
    } finally {
      controller?.abort();
    }
  };

  const deleteResearchConversation = async (targetSessionId: string) => {
    const response = await fetch(`/api/ai/research/sessions/${encodeURIComponent(targetSessionId)}`, { method: "DELETE" });
    if (!response.ok) return;
    if (targetSessionId === sessionId) {
      window.localStorage.removeItem(ACTIVE_RESEARCH_SESSION_KEY);
      startNewResearchSession();
    }
    await loadSessions();
  };

  const generateReport = async () => {
    if (!focus.trim() && !target) {
      setError("请描述你希望研究的问题");
      return;
    }
    setWriting(true);
    setReportProgress([]);
    setError("");
    try {
      const response = await fetch("/api/ai/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
        body: JSON.stringify({
          stockCode: target?.stockCode,
          categoryId: target?.categoryId,
          subjectType: target?.targetType,
          subjectKey: target?.subjectKey,
          subjectLabel: target?.companyName,
          comparisonStockCodes: parseComparisonCodes(comparisonCodes),
          reportType,
          engine: reportEngine,
          focus,
        }),
      });
      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "研报生成失败");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const message = JSON.parse(line) as {
            type: "progress" | "complete" | "error";
            event?: ReportGenerationProgress;
            report?: StoredResearchDocument;
            versions?: ResearchDocumentVersion[];
            error?: string;
          };
          if (message.type === "progress" && message.event) {
            setReportProgress((current) => [...current.filter((item) => item.phase !== message.event?.phase), message.event!]);
          } else if (message.type === "complete" && message.report) {
            setReport(message.report);
            setVersions(message.versions ?? []);
            void loadReportHistory();
            completed = true;
          } else if (message.type === "error") {
            throw new Error(message.error ?? "研报生成失败");
          }
        }
        if (done) break;
      }
      if (!completed) throw new Error("生成连接已结束，但没有收到完整报告");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "研报生成失败");
    } finally {
      setWriting(false);
    }
  };

  const saveReport = async (content: string) => {
    if (!report) return;
    setSavingReport(true);
    setError("");
    try {
      const response = await fetch("/api/ai/reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: report.id, content, changeSummary: "工作台手动编辑" }),
      });
      const payload = await response.json() as { report?: StoredResearchDocument; versions?: ResearchDocumentVersion[]; error?: string };
      if (!response.ok || !payload.report) throw new Error(payload.error ?? "报告保存失败");
      setReport(payload.report);
      setVersions(payload.versions ?? []);
      void loadReportHistory();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "报告保存失败");
    } finally {
      setSavingReport(false);
    }
  };

  const rewriteReportSection = async (sectionTitle: string, instruction: string) => {
    if (!report) return;
    setRewritingReport(true);
    setError("");
    try {
      const response = await fetch("/api/ai/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rewrite", reportId: report.id, sectionTitle, instruction }),
      });
      const payload = await response.json() as { report?: StoredResearchDocument; versions?: ResearchDocumentVersion[]; error?: string };
      if (!response.ok || !payload.report) throw new Error(payload.error ?? "章节改写失败");
      setReport(payload.report);
      setVersions(payload.versions ?? []);
      void loadReportHistory();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "章节改写失败");
    } finally {
      setRewritingReport(false);
    }
  };

  const restoreReportVersion = async (versionNumber: number) => {
    if (!report) return;
    setSavingReport(true);
    setError("");
    try {
      const response = await fetch("/api/ai/reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore", reportId: report.id, versionNumber }),
      });
      const payload = await response.json() as { report?: StoredResearchDocument; versions?: ResearchDocumentVersion[]; error?: string };
      if (!response.ok || !payload.report) throw new Error(payload.error ?? "版本恢复失败");
      setReport(payload.report);
      setVersions(payload.versions ?? []);
      void loadReportHistory();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "版本恢复失败");
    } finally {
      setSavingReport(false);
    }
  };

  const downloadReport = (format: "markdown" | "docx" | "pdf" = "markdown") => {
    if (!report) return;
    window.location.assign(`/api/ai/reports/export?id=${report.id}&format=${format}`);
  };

  const openHistoricalReport = async (reportId: number) => {
    setError("");
    try {
      const response = await fetch(`/api/ai/reports?id=${reportId}`);
      const payload = await response.json() as { report?: StoredResearchDocument; versions?: ResearchDocumentVersion[]; error?: string };
      if (!response.ok || !payload.report) throw new Error(payload.error ?? "历史研报读取失败");
      setReport(payload.report);
      setVersions(payload.versions ?? []);
      setReportType(payload.report.reportType);
      if (payload.report.stockCode) {
        const nextTarget: IntelligenceTarget = {
          targetType: "company",
          subjectKey: payload.report.stockCode,
          stockCode: payload.report.stockCode,
          companyName: payload.report.subjectLabel,
          board: "",
          industry: "",
          categoryId: payload.report.categoryId,
        };
        setTarget(nextTarget);
        setTargetQuery(payload.report.subjectLabel);
        onTargetChange?.(nextTarget);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "历史研报读取失败");
    }
  };

  if (embedded && tab === "agents") {
    return <AiResearchWorkspace
      target={target}
      question={question}
      depth={depth}
      result={result}
      running={running}
      activeRole={activeRole}
      error={sessionQuarantined
        ? "检测到这是一条修复前由寒暄触发的异常会话，旧结论已自动隔离。请新建会话后输入明确研究问题。"
        : error}
      sessionId={sessionId}
      sessions={sessions}
      conversationMessages={conversationMessages}
      progressEvents={progressEvents}
      submittedQuestion={submittedQuestion}
      researchSkills={researchSkills}
      researchTools={researchTools}
      providerReadiness={providerReadiness}
      selectedSkills={selectedSkills}
      contextCompressionEnabled={contextCompressionEnabled}
      onQuestionChange={setQuestion}
      onDepthChange={setDepth}
      onLaunchResearch={(prompt, skills) => void launchResearch({ prompt, skills })}
      onStopResearch={stopResearch}
      onOpenReport={() => onTabChange("report")}
      onNewSession={startNewResearchSession}
      onSwitchSession={(value) => void switchResearchSession(value)}
      onDeleteSession={(value) => void deleteResearchConversation(value)}
      onSelectedSkillsChange={setSelectedSkills}
      onContextCompressionChange={updateContextCompression}
      onAddContext={(value) => setPendingResearchContext((current) => ({ ...current, text: value }))}
    />;
  }

  if (embedded && tab === "report") {
    return <ReportWritingWorkspace
      target={target}
      report={report}
      reports={reportHistory}
      versions={versions}
      researchResult={result}
      generationProgress={reportProgress}
      writing={writing}
      saving={savingReport}
      rewriting={rewritingReport}
      reportType={reportType}
      reportEngine={reportEngine}
      finSightAvailability={finSightAvailability}
      focus={focus}
      comparisonCodes={comparisonCodes}
      error={error}
      onReportTypeChange={setReportType}
      onReportEngineChange={setReportEngine}
      onFocusChange={setFocus}
      onComparisonCodesChange={setComparisonCodes}
      onGenerate={() => void generateReport()}
      onSave={(content) => void saveReport(content)}
      onRewrite={(sectionTitle, instruction) => void rewriteReportSection(sectionTitle, instruction)}
      onRestore={(versionNumber) => void restoreReportVersion(versionNumber)}
      onOpenReport={(reportId) => void openHistoricalReport(reportId)}
      onExport={downloadReport}
      onBackToResearch={() => onTabChange("agents")}
      onAskAboutReport={() => {
        if (!report) return;
        setPendingResearchContext({
          source: "research_report",
          reportId: report.id,
          reportTitle: report.title,
          previousAnalysisSummary: report.markdown.slice(0, 8_000),
        });
        setQuestion(`请基于报告《${report.title}》继续核验：哪些核心结论证据仍不足，最新需要补充什么？`);
        onTabChange("agents");
      }}
    />;
  }

  return (
    <aside className={`ai-research-dock ${embedded ? "is-embedded" : ""}`} aria-label="AI 研究舱">
      <header className="ai-dock-header">
        <div><span><Sparkles aria-hidden="true" />UNIVERSAL FINANCIAL RESEARCH</span><strong>{tab === "agents" ? "AI研判 · 多智能体协作" : "智能研报写作"}</strong><small>直接用自然语言提问，系统会自动识别公司、行业、市场或开放金融议题</small></div>
        {!embedded ? <button type="button" onClick={onClose} title="关闭 AI 研究舱"><X /></button> : <span className="ai-context-lock">独立工具 · 全局可用</span>}
      </header>
      <nav className={`ai-dock-tabs ${embedded ? "is-embedded" : ""}`} aria-label="AI 研究模块">
        <button type="button" className={tab === "agents" ? "is-active" : ""} onClick={() => onTabChange("agents")}><Bot />智能体团队</button>
        <button type="button" className={tab === "report" ? "is-active" : ""} onClick={() => onTabChange("report")}><FileText />研报工坊</button>
      </nav>

      <section className="ai-target-bar" aria-label="AI 研究标的">
        <div className="ai-target-copy"><span>研究目标</span><strong>{target ? targetTitle(target) : "开放研究问题"}</strong><small>{target ? [target.board, target.industry, target.categoryId ? "已关联产业链" : target.targetType === "question" ? "本地证据边界模式" : "通用公司研究"].filter(Boolean).join(" · ") : "输入公司代码、名称、行业，或直接提出研究问题"}</small></div>
        <label className="ai-target-input"><Search aria-hidden="true" /><input value={targetQuery} onChange={(event) => setTargetQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void resolveTarget(); }} placeholder="股票代码或公司简称" /></label>
        <button type="button" className="ai-target-confirm" onClick={() => void resolveTarget()} disabled={resolvingTarget}>{resolvingTarget ? <LoaderCircle className="animate-spin" /> : <Search />}{resolvingTarget ? "正在识别" : "识别标的"}</button>
      </section>

      {error ? <div className="ai-dock-error"><ShieldAlert />{error}</div> : null}

      {tab === "agents" ? (
        <div className="ai-dock-body">
          <section className="ai-command-card">
            <label>研究问题<textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows={3} /></label>
            <div className="ai-command-row">
              <div className="ai-depth-control">
                {(["quick", "standard", "deep"] as const).map((value) => <button key={value} type="button" className={depth === value ? "is-active" : ""} onClick={() => setDepth(value)}>{value === "quick" ? "快速" : value === "deep" ? "深度" : "标准"}</button>)}
              </div>
              <button type="button" className="ai-launch-button" onClick={() => void launchResearch()} disabled={running || !question.trim()}>{running ? <LoaderCircle className="animate-spin" /> : <Send />}{running ? "团队分析中" : "启动联合研究"}</button>
            </div>
          </section>

          <section className="ai-team-status">
            <div className="ai-section-title"><span><Network />AGENT TEAM</span><b>{running ? `${activeRole + 1}/5 协作中` : `${completedRoles}/5 已完成`}</b></div>
            <div className="ai-role-strip">
              {ROLE_PREVIEW.map((role, index) => <div key={role} className={`${result || index < activeRole ? "is-done" : ""} ${running && index === activeRole ? "is-running" : ""}`}><span>{result || index < activeRole ? <CheckCircle2 /> : index + 1}</span><b>{role}</b></div>)}
            </div>
          </section>

          {result ? <ResearchResult result={result} /> : <div className="ai-empty-state"><Bot /><strong>让五个角色交叉验证同一家公司</strong><p>团队会分别检查业务、产业链、情报、风险，再由主审整合结论与待验证问题。</p></div>}
        </div>
      ) : (
        <div className="report-workspace">
          <aside className="report-outline">
            <header><span>REPORT OUTLINE</span><b>{report ? '8/9' : '0/9'}</b></header>
            {['投资摘要', '公司概览', '产业链位置', '竞争优势', '财务分析', '催化因素', '风险分析', '估值与结论', '附录证据'].map((item, index) => (
              <div key={item} className={index === 0 ? 'is-active' : ''}><i>{String(index + 1).padStart(2, '0')}</i><span>{item}</span>{report && index < 8 ? <CheckCircle2 /> : null}</div>
            ))}
            <p className="report-add-section">章节由当前报告大纲统一管理</p>
          </aside>

          <section className="report-editor" aria-label="研报编辑器">
            <section className="report-generation-bar">
              <div className="ai-report-template-row">
                <button type="button" className={reportType === "company" ? "is-active" : ""} onClick={() => setReportType("company")}><strong>公司深度报告</strong><span>业务、产业链、竞争力与风险</span></button>
                <button type="button" className={reportType === "industry" ? "is-active" : ""} onClick={() => setReportType("industry")}><strong>赛道研究报告</strong><span>行业格局、环节与公司映射</span></button>
              </div>
              <label>写作重点<textarea value={focus} onChange={(event) => setFocus(event.target.value)} rows={2} /></label>
              <button type="button" className="ai-launch-button" onClick={generateReport} disabled={writing || target?.targetType !== "company"}>{writing ? <LoaderCircle className="animate-spin" /> : <Sparkles />}{writing ? "正在组织章节" : "生成研究报告"}</button>
            </section>
            <div className="report-editor-toolbar"><span>撤销</span><span>重做</span><b>正文</b><span>思源黑体</span><span>14</span><b>B</b><i>I</i><span>引用</span><span>图表</span></div>
            {report ? (
              <section className="ai-report-preview">
                <div className="ai-section-title"><span>01 · 投资摘要</span><button type="button" onClick={() => downloadReport()}><Download />导出 Markdown</button></div>
                <ReportPreview markdown={report.markdown} />
              </section>
            ) : <div className="report-editor-empty"><FileText /><strong>从研究资料生成可编辑研报</strong><p>选择报告类型并补充写作重点，系统将按章节组织观点、数据、风险和证据边界。</p></div>}
          </section>

          <aside className="report-quality">
            <section><header><span>引用与质检</span><Quote /></header><div className="report-source-stat"><b>{result?.stages.length ?? 0}</b><span>智能体结论</span></div><div className="report-source-stat"><b>{report ? 1 : 0}</b><span>当前报告</span></div></section>
            <section><header><span>质量评分</span><ShieldAlert /></header><div className="report-score"><b>{report ? 92 : 0}</b><span>/100</span></div><ul><li>事实完整性</li><li>证据引用充分</li><li>结论逻辑严谨</li><li>风险披露清晰</li></ul></section>
            <section><header><span>导出与发布</span><Download /></header><button type="button" disabled={!report} onClick={() => downloadReport()}>导出 Markdown</button><p>{report ? "报告已保存到研报历史" : "生成后自动保存到研报历史"}</p></section>
          </aside>
        </div>
      )}
    </aside>
  );
}

type AiResearchWorkspaceProps = {
  target: IntelligenceTarget | null;
  question: string;
  depth: "quick" | "standard" | "deep";
  result: DeepResearchResult | null;
  running: boolean;
  activeRole: number;
  error: string;
  sessionId: string;
  sessions: ResearchConversationSession[];
  conversationMessages: ResearchConversationMessage[];
  progressEvents: ResearchProgressEvent[];
  submittedQuestion: string;
  researchSkills: ResearchSkill[];
  researchTools: DAStockResearchTool[];
  providerReadiness: ResearchProviderReadiness | null;
  selectedSkills: string[];
  contextCompressionEnabled: boolean;
  onQuestionChange: (value: string) => void;
  onDepthChange: (value: "quick" | "standard" | "deep") => void;
  onLaunchResearch: (prompt?: string, skills?: string[]) => void;
  onStopResearch: () => void;
  onOpenReport: () => void;
  onNewSession: () => void;
  onSwitchSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onSelectedSkillsChange: (skills: string[]) => void;
  onContextCompressionChange: (enabled: boolean) => void;
  onAddContext: (value: string) => void;
};

// Starter questions only prefill the composer and method selection. They never
// launch a hidden hard-coded analysis; the user's final question and current
// multi-selection are the only request contract sent to the research engine.
const QUICK_RESEARCH_QUESTIONS = [
  { label: "用缠论分析茅台", skill: "chan_theory" },
  { label: "波浪理论看宁德时代", skill: "wave_theory" },
  { label: "分析比亚迪趋势", skill: "bull_trend" },
  { label: "箱体震荡技能看中芯国际", skill: "box_oscillation" },
  { label: "分析腾讯 hk00700", skill: "bull_trend" },
  { label: "用情绪周期分析东方财富", skill: "emotion_cycle" },
] as const;

const RESEARCH_DEPTH_OPTIONS = [
  { id: "quick", name: "快速", description: "单次综合，适合事实确认与简明问答", meta: "更快 · 较少上下文", icon: Sparkles },
  { id: "standard", name: "标准", description: "多角色研究并由主审合并证据与反证", meta: "平衡 · 推荐", icon: Network },
  { id: "deep", name: "深度", description: "扩展检索与推理预算，适合复杂开放问题", meta: "更全面 · 耗时更长", icon: Gauge },
] as const;

const RESEARCH_SKILL_CATEGORIES: Array<{ id: "all" | ResearchSkill["category"]; name: string }> = [
  { id: "all", name: "全部" },
  { id: "trend", name: "趋势" },
  { id: "framework", name: "框架" },
  { id: "pattern", name: "形态" },
  { id: "reversal", name: "反转" },
];

function AiResearchWorkspace({
  target,
  question,
  depth,
  result,
  running,
  activeRole,
  error,
  sessionId,
  sessions,
  conversationMessages,
  progressEvents,
  submittedQuestion,
  researchSkills,
  researchTools,
  providerReadiness,
  selectedSkills,
  contextCompressionEnabled,
  onQuestionChange,
  onDepthChange,
  onLaunchResearch,
  onStopResearch,
  onOpenReport,
  onNewSession,
  onSwitchSession,
  onDeleteSession,
  onSelectedSkillsChange,
  onContextCompressionChange,
  onAddContext,
}: AiResearchWorkspaceProps) {
  const [dialog, setDialog] = useState<"guide" | "settings" | "context" | "sources" | null>(null);
  const [additionalContext, setAdditionalContext] = useState("");
  const [evidenceCollapsed, setEvidenceCollapsed] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(true);
  const [mobileSessionsOpen, setMobileSessionsOpen] = useState(false);
  const [sessionSearch, setSessionSearch] = useState("");
  const [deleteCandidate, setDeleteCandidate] = useState<ResearchConversationSession | null>(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<number | "latest" | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareStatus, setShareStatus] = useState("");
  const [skillCategory, setSkillCategory] = useState<"all" | ResearchSkill["category"]>("all");
  const [sourceView, setSourceView] = useState<"directory" | "connected" | "policy">("directory");
  const [sourceTier, setSourceTier] = useState<"all" | ResearchSourceTierId>("all");
  const [sourceSearch, setSourceSearch] = useState("");
  const allVisibleSessions = useMemo(
    () => sessions.filter((session) => session.integrityStatus !== "legacy_target_mismatch"),
    [sessions],
  );
  const normalizedSessionSearch = sessionSearch.trim().toLocaleLowerCase();
  const visibleSessions = useMemo(
    () => allVisibleSessions.filter((session) => !normalizedSessionSearch
      || `${session.title} ${session.subjectLabel}`.toLocaleLowerCase().includes(normalizedSessionSearch)),
    [allVisibleSessions, normalizedSessionSearch],
  );
  const quarantinedSessionCount = sessions.length - allVisibleSessions.length;
  const visibleSkills = useMemo(() => researchSkills.filter((skill) => skillCategory === "all" || skill.category === skillCategory), [researchSkills, skillCategory]);
  const normalizedSourceSearch = sourceSearch.trim().toLocaleLowerCase();
  const visibleSourceTypes = useMemo(() => RESEARCH_SOURCE_TYPES.filter((source) => {
    if (sourceTier !== "all" && source.tier !== sourceTier) return false;
    if (!normalizedSourceSearch) return true;
    return `${source.name} ${source.group} ${source.description} ${source.examples} ${source.useCases}`.toLocaleLowerCase().includes(normalizedSourceSearch);
  }), [sourceTier, normalizedSourceSearch]);
  const activeSourceScenario = inferResearchSourceScenario(question || submittedQuestion);
  const sidebarResearchSuggestions = useMemo(() => {
    const subject = target?.companyName?.trim() || "当前研究对象";
    if (target?.targetType === "company") {
      return [
        { eyebrow: "经营", title: "盈利质量与现金流", prompt: `拆解${subject}的盈利质量、现金流与增长可持续性，并核验关键财务证据`, skills: ["growth_quality"] },
        { eyebrow: "催化", title: "近期事件与预期差", prompt: `研究${subject}近期公告、产业催化与市场预期差，列出兑现路径和失效条件`, skills: ["event_driven", "expectation_repricing"] },
        { eyebrow: "交易", title: "趋势、量价与关键位", prompt: `结合趋势、量价和关键支撑阻力分析${subject}，给出不同情景下的观察条件`, skills: ["bull_trend", "volume_breakout"] },
      ];
    }
    if (target?.targetType === "industry") {
      return [
        { eyebrow: "格局", title: "产业链与竞争位置", prompt: `梳理${subject}产业链、竞争格局和上下游议价能力，识别核心受益环节`, skills: ["growth_quality"] },
        { eyebrow: "景气", title: "景气线索与催化", prompt: `跟踪${subject}的供需、价格、政策与订单线索，判断景气变化是否可持续`, skills: ["event_driven"] },
        { eyebrow: "映射", title: "相关公司与验证指标", prompt: `筛选${subject}中业务相关性较高的公司，并列出需要持续验证的经营指标`, skills: ["hot_theme"] },
      ];
    }
    return [
      { eyebrow: "结构", title: "指数与市场宽度", prompt: "分析A股主要指数、涨跌家数、成交额和风格轮动，判断当前市场结构", skills: ["bull_trend"] },
      { eyebrow: "资金", title: "资金与板块轮动", prompt: "研究市场资金流向、领涨板块和持续性，区分趋势主线与短期脉冲", skills: ["hot_theme", "emotion_cycle"] },
      { eyebrow: "情景", title: "催化、风险与验证", prompt: "梳理影响大盘的近期事件与主要风险，给出多空情景和下一步验证指标", skills: ["event_driven", "expectation_repricing"] },
    ];
  }, [target]);

  useEffect(() => {
    setShareStatus("");
  }, [sessionId]);
  const chatScrollRef = React.useRef<HTMLElement | null>(null);
  const company = target?.companyName ?? "研究标的";
  const groundedFindings = [...new Set(result?.stages.flatMap((stage) => stage.findings) ?? [])];
  const targetContextLabel = target?.targetType === "industry"
    ? "产业档案 · 关系证据"
    : target?.targetType === "question"
      ? "开放问题 · 本地证据边界"
      : "公司档案 · 产业链证据";
  const latestStoredAssistantHasResult = Boolean(
    [...conversationMessages].reverse().find((message) => message.role === "assistant")?.metadata.result,
  );
  const hasConversation = conversationMessages.length > 0 || Boolean(result) || running;
  const toggleSkill = (skillId: string) => {
    onSelectedSkillsChange(selectedSkills.includes(skillId)
      ? selectedSkills.filter((item) => item !== skillId)
      : selectedSkills.length < 3 ? [...selectedSkills, skillId] : selectedSkills);
  };
  const scrollToLatest = React.useCallback((behavior: ScrollBehavior = "smooth") => {
    const element = chatScrollRef.current;
    if (!element) return;
    if (typeof element.scrollTo === "function") {
      element.scrollTo({ top: element.scrollHeight, behavior });
    } else {
      element.scrollTop = element.scrollHeight;
    }
    setShowJumpToLatest(false);
  }, []);
  useEffect(() => {
    const element = chatScrollRef.current;
    if (!element) return;
    if (running) {
      scrollToLatest("smooth");
      return;
    }
    // A completed research turn is a document, not a chat receipt. Open it at
    // the question and thesis so the user reads top-down like the reference UI.
    element.scrollTop = 0;
    setShowJumpToLatest(false);
  }, [conversationMessages.length, progressEvents.length, running, scrollToLatest]);
  const handleChatScroll = () => {
    const element = chatScrollRef.current;
    if (!element) return;
    setShowJumpToLatest(element.scrollHeight - element.scrollTop - element.clientHeight > 90);
  };
  const copyMessage = async (id: number | "latest", content: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedMessageId(id);
    window.setTimeout(() => setCopiedMessageId((current) => current === id ? null : current), 1600);
  };
  const downloadMarkdown = (filename: string, content: string) => {
    const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };
  const exportSession = () => {
    const turns = conversationMessages.map((message) =>
      `${message.role === "user" ? "## 用户" : "## AI 研究"}\n\n${message.content}`,
    );
    if (running && submittedQuestion) turns.push(`## 用户\n\n${submittedQuestion}`);
    downloadMarkdown(`ai-research-${sessionId}.md`, [`# ${company} AI 研究会话`, ...turns].join("\n\n"));
  };
  const shareSession = async () => {
    const turns = conversationMessages.map((message) =>
      `${message.role === "user" ? "## 用户" : "## AI 研究"}\n\n${message.content}`,
    );
    if (!turns.length && result) turns.push(`## AI 研究\n\n${resultToClientMarkdown(result)}`);
    if (!turns.length || sharing) return;
    setSharing(true);
    setShareStatus("");
    try {
      const response = await fetch("/api/ai/research/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: `${company} AI 研究`, content: turns.join("\n\n") }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "分享失败");
      setShareStatus("已发送");
    } catch (reason) {
      setShareStatus(reason instanceof Error ? reason.message : "分享失败");
    } finally {
      setSharing(false);
    }
  };

  return <div className="ai-studio" aria-label="AI研判工作空间">
    <h2 className="ai-studio-title">AI研判</h2>

    {error ? <div className="ai-studio-error"><ShieldAlert /><span>{error}</span>{error.includes("修复前的异常会话") ? <button type="button" onClick={onNewSession}><MessageSquarePlus />新建干净会话</button> : null}</div> : null}

    <div className={`ai-studio-grid ${evidenceOpen ? "has-evidence" : ""}`}>
      {mobileSessionsOpen ? <button type="button" className="ai-mobile-sidebar-backdrop" aria-label="关闭历史会话" onClick={() => setMobileSessionsOpen(false)} /> : null}
      <aside className={`ai-studio-left ${mobileSessionsOpen ? "is-mobile-open" : ""}`}>
        <section className="ai-side-panel ai-conversations">
          <header className="ai-conversation-header"><div><h3>研究会话</h3><small>保存你的分析脉络</small></div><div><span>{allVisibleSessions.length}</span><button type="button" className="ai-sidebar-new" aria-label="新建会话" title="新建会话" onClick={() => { onNewSession(); setAdditionalContext(""); setMobileSessionsOpen(false); }}><MessageSquarePlus /></button><button type="button" className="ai-mobile-sidebar-close" aria-label="关闭历史会话" onClick={() => setMobileSessionsOpen(false)}><X /></button></div></header>
          <label className="ai-session-search"><Search /><input value={sessionSearch} onChange={(event) => setSessionSearch(event.target.value)} placeholder="搜索标的或研究问题" /></label>
          <div>{visibleSessions.length ? visibleSessions.map((item) => <article key={item.sessionId} className={item.sessionId === sessionId ? "is-active" : ""}>
            <button type="button" className="ai-conversation-open" onClick={() => { onSwitchSession(item.sessionId); setMobileSessionsOpen(false); }}><span><Bot /></span><div><b>{item.title || item.subjectLabel}</b><small>{item.subjectLabel}<i />{item.messageCount} 条消息</small></div><time title={formatRelativeTime(item.updatedAt)}>{formatCalendarDate(item.updatedAt)}</time></button>
            <button type="button" className="ai-conversation-delete" aria-label={`删除 ${item.title}`} onClick={() => setDeleteCandidate(item)}><Trash2 /></button>
          </article>) : <p className="ai-conversation-empty">{normalizedSessionSearch ? "没有匹配的研究对话" : "当前目标尚无已完成研究"}</p>}</div>
          {quarantinedSessionCount ? <p className="ai-session-quarantine"><ShieldAlert />已隔离 {quarantinedSessionCount} 条修复前的目标错配会话</p> : null}
        </section>
        <section className="ai-side-panel ai-prompt-inspirations">
          <header><div><h3>下一步研究</h3><small>根据当前对话动态建议</small></div></header>
          <div>{sidebarResearchSuggestions.map((item, index) => <button type="button" key={item.title} onClick={() => { onQuestionChange(item.prompt); onSelectedSkillsChange(item.skills); }} title={item.prompt}><span>{String(index + 1).padStart(2, "0")}</span><div><small>{item.eyebrow}</small><b>{item.title}</b></div><ChevronRight /></button>)}</div>
        </section>
      </aside>

      <section className="ai-chat-stage" aria-label="AI研判对话">
        <header className="ai-workbench-target-bar ai-workbench-toolbar">
          <div className="ai-target-actions">
            <button type="button" className="ai-mobile-history-trigger" onClick={() => setMobileSessionsOpen(true)}><Bot />历史</button>
            <button type="button" aria-label="研究设置" onClick={() => setDialog("settings")}><Settings2 />设置</button>
            <button type="button" aria-label={evidenceOpen ? "收起证据" : "证据审计"} className={evidenceOpen ? "is-active" : ""} onClick={() => setEvidenceOpen((value) => !value)}><BookOpenCheck />证据</button>
            {hasConversation ? <button type="button" onClick={() => void shareSession()} disabled={sharing} title={shareStatus || "发送到配置的研究分享 Webhook"}><Share2 />{sharing ? "发送中" : shareStatus || "分享"}</button> : null}
            {conversationMessages.length ? <button type="button" onClick={exportSession} title="导出 Markdown 会话"><Download />导出</button> : null}
          </div>
        </header>

        <section className="ai-chat-scroll" ref={chatScrollRef} onScroll={handleChatScroll}>
          {conversationMessages.map((message) => message.role === "user"
            ? <div className="ai-user-message is-history" key={message.id}><p>{message.content}</p><span>N</span><time>{formatClock(message.createdAt)}</time></div>
            : <AssistantResearchTurn
              key={message.id}
              message={message}
              researchSkills={researchSkills}
              copied={copiedMessageId === message.id}
              onCopy={() => void copyMessage(message.id, message.content)}
              onDownload={() => downloadMarkdown(`ai-research-message-${message.id}.md`, message.content)}
            />)}
          {running && submittedQuestion ? <div className="ai-user-message"><p>{submittedQuestion}</p><span>N</span><time>{formatClock(new Date().toISOString())}</time></div> : null}
          {running ? <LiveResearchTurn
            depth={depth}
            activeRole={activeRole}
            progressEvents={progressEvents}
            targetContextLabel={targetContextLabel}
          /> : null}
          {!running && result && !latestStoredAssistantHasResult ? <AssistantResearchTurn
            message={{
              id: -1,
              role: "assistant",
              content: result.thesis,
              metadata: { result, progressEvents },
              createdAt: new Date().toISOString(),
            }}
            researchSkills={researchSkills}
            copied={copiedMessageId === "latest"}
            onCopy={() => void copyMessage("latest", resultToClientMarkdown(result))}
            onDownload={() => downloadMarkdown("ai-research-latest.md", resultToClientMarkdown(result))}
          /> : null}
          {!running && !result && conversationMessages.length === 0 ? <article className="ai-research-empty">
            <span><Sparkles /><i>AI</i></span>
            <h3>直接提出你的金融问题</h3>
            <p>无需选择标的或套用格式。系统会理解问题，自动调用内置金融数据源、研究工具和多 Agent 工作流，并让回答结构随问题与证据动态生成。</p>
            <small className="ai-quick-questions-label">示例提问 · 仅填入编辑框，不会自动运行</small>
            <div className="ai-quick-questions" aria-label="研究问题示例">{QUICK_RESEARCH_QUESTIONS.map((item) => <button type="button" key={item.label} onClick={() => { onQuestionChange(item.label); onSelectedSkillsChange([item.skill]); }}>{item.label}</button>)}</div>
          </article> : null}
        </section>
        {showJumpToLatest ? <button type="button" className="ai-jump-latest" onClick={() => scrollToLatest()}><ChevronDown />回到最新</button> : null}

        <section className="ai-composer">
          {selectedSkills.length ? <div className="ai-composer-strategies"><span><BarChart3 />本轮方法</span>{selectedSkills.map((id) => <button type="button" key={id} onClick={() => toggleSkill(id)} title="移除此方法">{researchSkills.find((skill) => skill.id === id)?.name ?? id}<X /></button>)}<button type="button" onClick={() => onSelectedSkillsChange([])}>交给 Agent 自主规划</button></div> : null}
          <textarea value={question} rows={1} onChange={(event) => onQuestionChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); onLaunchResearch(); } }} placeholder="直接提问任何金融问题，Enter 发送，Shift + Enter 换行" aria-label="金融研判问题" />
          <footer><div><button type="button" onClick={() => setDialog("context")}><Paperclip />添加上下文</button><button type="button" onClick={() => setDialog("settings")}><Settings2 />策略与深度{selectedSkills.length ? ` · ${selectedSkills.length}` : ""}</button><button type="button" title="查看数据工具目录与本轮可用性" onClick={() => setDialog("sources")}><Globe2 />数据源</button><button type="button" onClick={() => setDialog("guide")}><BookOpenCheck />说明</button></div><span>{running ? "研究执行中，可随时停止" : contextCompressionEnabled ? "已启用长会话记忆压缩" : "Agent 将按问题动态规划回答"}</span><button type="button" className={`ai-composer-send ${running ? "is-stop" : ""}`} aria-label={running ? "停止研究" : "开始研究"} onClick={running ? onStopResearch : () => onLaunchResearch()} disabled={!running && !question.trim()}>{running ? <Square /> : <Send />}</button></footer>
        </section>
        <small className="ai-disclaimer">内容由 AI 生成，仅供参考，请结合专业判断。免责声明</small>
        <button type="button" className="ai-mobile-to-report" onClick={onOpenReport}><FileText />转入报告工坊 <ChevronRight /></button>
      </section>

      {evidenceOpen ? <aside className={`ai-evidence-rail ${evidenceCollapsed ? "is-collapsed" : ""}`}>
        <header><h3>证据面板</h3><button type="button" aria-expanded={!evidenceCollapsed} onClick={() => setEvidenceCollapsed((value) => !value)}>{evidenceCollapsed ? "展开" : "收起"} <ChevronRight /></button></header>
        {!evidenceCollapsed ? <><EvidenceGroup title="已引用资料" count={result?.citations?.length ?? 0} tone="source" items={(result?.citations ?? []).slice(0, 6).map((citation) => citation.title)} empty="运行后显示真实引用" />
        <EvidenceGroup title="支持结论" count={groundedFindings.length} tone="support" items={groundedFindings.slice(0, 5).map(formatResearchClaimText)} empty="尚无有证据支持的结论" />
        <EvidenceGroup title="风险与反证" count={result?.risks.length ?? 0} tone="counter" items={(result?.risks ?? []).slice(0, 5)} empty="尚未完成风险审查" />
        <EvidenceGroup title="待核验证据" count={result?.verificationQuestions.length ?? 0} tone="pending" items={(result?.verificationQuestions ?? []).slice(0, 5)} empty="运行后生成核验清单" />
        <section className="ai-data-sources"><header><b>可引用来源</b><span>{new Set((result?.citations ?? []).map((citation) => citation.sourceType)).size}</span></header><div>{[...new Set((result?.citations ?? []).map((citation) => citation.sourceType))].slice(0, 6).map((source) => <i key={source}>{source}</i>)}{!(result?.citations?.length ?? 0) ? <i>待载入</i> : null}</div></section>
        <section className="ai-evidence-quality"><header><b>数据能力与证据约束</b><Gauge /></header>{[
          ["有效引用", result?.citations?.length ?? 0, Math.min(100, (result?.citations?.length ?? 0) * 12)],
          ["角色覆盖", result?.stages.filter((stage) => (stage.citationIds?.length ?? 0) > 0).length ?? 0, (result?.stages.filter((stage) => (stage.citationIds?.length ?? 0) > 0).length ?? 0) * 20],
          ["拦截无引用", result?.unsupportedClaimCount ?? 0, Math.min(100, (result?.unsupportedClaimCount ?? 0) * 20)],
        ].map(([label, value, percent]) => <div key={label}><span>{label}</span><i><b style={{ width: `${percent}%` }} /></i><em>{value}</em></div>)}{result?.execution?.toolTrace?.filter((trace) => trace.status === "completed").map((trace) => <p className={`ai-tool-trace is-${trace.status}`} key={trace.tool}><b>{toolLabel(trace.tool)}</b><span>{trace.detail}</span></p>)}</section>
        <button type="button" className="ai-to-report" onClick={onOpenReport}><FileText />转入报告工坊 <ChevronRight /></button></> : <p className="ai-evidence-collapsed-note">{result?.citations?.length ?? 0} 条引用 · {groundedFindings.length} 条支持结论</p>}
      </aside> : null}
    </div>
    {deleteCandidate ? <div className="ai-dialog-shell" role="presentation">
      <button type="button" className="ai-dialog-backdrop" aria-label="取消删除" onClick={() => setDeleteCandidate(null)} />
      <section className="ai-dialog ai-delete-dialog" role="alertdialog" aria-modal="true" aria-label="删除研究会话">
        <header><strong>删除研究会话</strong><button type="button" aria-label="关闭" onClick={() => setDeleteCandidate(null)}><X /></button></header>
        <p>确定删除“{deleteCandidate.title}”及其全部消息吗？此操作不可撤销。</p>
        <footer><button type="button" onClick={() => setDeleteCandidate(null)}>取消</button><button type="button" className="is-danger" onClick={() => { onDeleteSession(deleteCandidate.sessionId); setDeleteCandidate(null); }}>删除会话</button></footer>
      </section>
    </div> : null}
    {dialog ? <div className="ai-dialog-shell" role="presentation">
      <button type="button" className="ai-dialog-backdrop" aria-label="关闭弹窗" onClick={() => setDialog(null)} />
      <section className={`ai-dialog is-${dialog}`} role="dialog" aria-modal="true" aria-label={dialog === "settings" ? "研究设置" : dialogTitle(dialog)}>
        <header><strong>{dialogTitle(dialog)}</strong><button type="button" aria-label="关闭" onClick={() => setDialog(null)}><X /></button></header>
        {dialog === "guide" ? <ol>
          <li>先识别公司、行业或开放研究目标。</li>
          <li>可使用通用问答或最多 3 个金融策略技能；未选择时由 Agent 自主规划。</li>
          <li>快速模式单次综合，标准和深度模式由多角色与主审交叉验证。</li>
          <li>会话自动保存并支持连续追问；长会话可开启上下文压缩。</li>
          <li>系统只保留带有效证据引用的事实结论，无 Provider 数据的工具会明确标记不可用。</li>
          <li>结果可复制、下载、分享，或转入报告工坊继续写作与归档。</li>
        </ol> : null}
        {dialog === "settings" ? <div className="ai-dialog-settings">
          <div className="ai-settings-intro"><div><span>研究编排</span><strong>{selectedSkills.length ? `已选 ${selectedSkills.length} / 3 个方法` : "Agent 自主规划"}</strong></div><p>研究深度控制协同角色与预算；方法是可选约束，不会把回答锁进固定模板。</p></div>
          <section className="ai-settings-section"><header><div><b>研究深度</b><small>按问题复杂度分配检索与交叉验证预算</small></div><em>{RESEARCH_DEPTH_OPTIONS.find((item) => item.id === depth)?.name}</em></header><div className="ai-depth-picker">{RESEARCH_DEPTH_OPTIONS.map((option) => { const Icon = option.icon; return <button type="button" className={depth === option.id ? "is-active" : ""} key={option.id} onClick={() => onDepthChange(option.id)}><span><Icon /></span><b>{option.name}</b><small>{option.description}</small><em>{option.meta}</em>{depth === option.id ? <Check /> : null}</button>; })}</div></section>
          <label className="ai-settings-toggle"><input type="checkbox" checked={contextCompressionEnabled} onChange={(event) => onContextCompressionChange(event.target.checked)} /><span><b>长会话记忆压缩</b><small>摘要早期消息并保留最近 3 轮，适合连续追问</small></span><em>{contextCompressionEnabled ? "已开启" : "按需开启"}</em></label>
          <section className="ai-settings-section ai-method-section"><header><div><b>专业分析方法</b><small>最多选择 3 个；留空时 Agent 根据问题动态选择</small></div><button type="button" disabled={!selectedSkills.length} onClick={() => onSelectedSkillsChange([])}>清空</button></header><nav>{RESEARCH_SKILL_CATEGORIES.map((category) => <button type="button" key={category.id} className={skillCategory === category.id ? "is-active" : ""} onClick={() => setSkillCategory(category.id)}>{category.name}</button>)}</nav><div className="ai-skill-picker">{visibleSkills.map((skill) => <button type="button" key={skill.id} className={selectedSkills.includes(skill.id) ? "is-active" : ""} disabled={!selectedSkills.includes(skill.id) && selectedSkills.length >= 3} onClick={() => toggleSkill(skill.id)}><span>{selectedSkills.includes(skill.id) ? <Check /> : <Bot />}</span><b>{skill.name}</b><small>{skill.description}</small><em>{skill.requiredData.join(" · ")}</em></button>)}</div></section>
          <footer><span>{selectedSkills.length ? `本轮会把 ${selectedSkills.map((id) => researchSkills.find((skill) => skill.id === id)?.name).filter(Boolean).join("、")} 交给 Agent 编排` : "不预设方法，回答结构将随问题动态生成"}</span><button type="button" onClick={() => setDialog(null)}>完成</button></footer>
        </div> : null}
        {dialog === "sources" ? <div className="ai-source-hub">
          <div className="ai-source-summary"><div><span><BookOpenCheck /></span><p><b>证据优先，而不是来源堆叠</b><small>目录共 {RESEARCH_SOURCE_TYPES.length} 类信源。Agent 按问题选择来源层级，低可信内容只作为待核验线索。</small></p></div><em>当前建议：{activeSourceScenario.name}</em></div>
          <nav className="ai-source-tabs"><button type="button" className={sourceView === "directory" ? "is-active" : ""} onClick={() => setSourceView("directory")}>信源目录 <span>{RESEARCH_SOURCE_TYPES.length}</span></button><button type="button" className={sourceView === "connected" ? "is-active" : ""} onClick={() => setSourceView("connected")}>已接入能力 <span>{researchTools.length}</span></button><button type="button" className={sourceView === "policy" ? "is-active" : ""} onClick={() => setSourceView("policy")}>选择规则 <span>{RESEARCH_SOURCE_SCENARIOS.length}</span></button></nav>
          {sourceView === "directory" ? <section className="ai-source-directory"><label><Search /><input value={sourceSearch} onChange={(event) => setSourceSearch(event.target.value)} placeholder="搜索机构、平台、信源类型或适用场景" /></label><div className="ai-source-tier-filter"><button type="button" className={sourceTier === "all" ? "is-active" : ""} onClick={() => setSourceTier("all")}>全部</button>{RESEARCH_SOURCE_TIERS.map((tier) => <button type="button" key={tier.id} className={sourceTier === tier.id ? "is-active" : ""} onClick={() => setSourceTier(tier.id)}><b>{tier.id}</b>{tier.name}</button>)}</div><div className="ai-source-directory-grid">{visibleSourceTypes.map((source) => <article key={`${source.tier}-${source.name}`}><header><span>{source.tier}</span><b>{source.name}</b><em>{source.rating}</em></header><p>{source.description}</p><small>{source.examples}</small><footer>{source.useCases}</footer></article>)}</div>{!visibleSourceTypes.length ? <p className="ai-source-empty">没有匹配的信源类型</p> : null}</section> : null}
          {sourceView === "connected" ? <section className="ai-connected-sources"><header><div><b>运行时接入状态</b><small>已接入不等于本轮调用成功；以研究过程中的工具状态为准</small></div><em>{providerReadiness?.configured ? `${providerReadiness.enabledCount}/${providerReadiness.providerCount} 个来源已接入` : "等待配置"}</em></header>{providerReadiness?.error ? <p>{providerReadiness.error.replace(/DA-Stock/gi, "外部数据源")}</p> : null}<div className="ai-connected-provider-grid">{(providerReadiness?.providers ?? []).filter((provider) => provider.enabled).map((provider) => <article key={provider.provider}><span><Globe2 /></span><div><b>{provider.provider.replace(/DA-Stock/gi, "统一数据源")}</b><small>{provider.kind} · {provider.markets.join("/")} · {provider.runtime}</small></div><em>已接入</em></article>)}</div><div className="ai-connected-tool-grid">{researchTools.map((tool) => { const trace = result?.execution?.toolTrace?.find((item) => item.tool === tool.id); return <article key={tool.id} className={`is-${trace?.status ?? "idle"}`}><span><Wrench /></span><div><b>{tool.name.replace(/DA-Stock/gi, "研究")}</b><small>{tool.description.replace(/DA-Stock/gi, "统一研究引擎")}</small></div><em>{trace?.status === "completed" ? "本轮调用成功" : trace?.status === "unavailable" ? "本轮调用失败" : "等待本轮调用"}</em></article>; })}</div></section> : null}
          {sourceView === "policy" ? <section className="ai-source-policy"><div className="ai-source-policy-current"><span>当前问题自动匹配</span><b>{activeSourceScenario.name}</b><p>{activeSourceScenario.rule}</p><em>{activeSourceScenario.guardrail}</em></div><div>{RESEARCH_SOURCE_SCENARIOS.map((scenario) => <article key={scenario.name} className={scenario.name === activeSourceScenario.name ? "is-active" : ""}><header><b>{scenario.name}</b>{scenario.name === activeSourceScenario.name ? <span>当前</span> : null}</header><dl><div><dt>首选</dt><dd>{scenario.primary}</dd></div><div><dt>补充</dt><dd>{scenario.secondary}</dd></div></dl><p>{scenario.rule}</p><small><ShieldAlert />{scenario.guardrail}</small></article>)}</div></section> : null}
        </div> : null}
        {dialog === "context" ? <div className="ai-dialog-context">
          <p>补充会议纪要、关注假设或需要优先核验的边界。内容会作为结构化上下文随本次请求保存。</p>
          <textarea rows={6} value={additionalContext} onChange={(event) => setAdditionalContext(event.target.value)} placeholder="例如：重点核验海外收入的持续性，不采纳无原文链接的市场传闻。" />
          <button type="button" disabled={!additionalContext.trim()} onClick={() => { onAddContext(additionalContext.trim()); onQuestionChange(`${question.trim()}\n\n补充上下文：${additionalContext.trim()}`.trim()); setDialog(null); }}>加入本次研究</button>
        </div> : null}
      </section>
    </div> : null}
  </div>;
}

function AssistantResearchTurn({
  message,
  researchSkills,
  copied,
  onCopy,
  onDownload,
}: {
  message: ResearchConversationMessage;
  researchSkills: ResearchSkill[];
  copied: boolean;
  onCopy: () => void;
  onDownload: () => void;
}) {
  const [processOpen, setProcessOpen] = useState(true);
  const result = message.metadata.result;
  const progressEvents = message.metadata.progressEvents ?? [];
  const skillLabel = message.metadata.skills
    ?.map((id) => researchSkills.find((skill) => skill.id === id)?.name ?? id)
    .join(" · ");
  const completedOperations = progressEvents.filter((event) =>
    event.type === "tool_done" || event.type === "agent_done",
  );
  const totalDurationMs = completedOperations.reduce((sum, event) => sum + (event.durationMs ?? 0), 0);
  const failed = Boolean(message.metadata.error) || message.content.startsWith("[研究失败]");

  return <article className="ai-assistant-message ai-research-turn">
    <header>
      <span><Sparkles /><i>AI</i></span>
      <div><b>{message.metadata.cancelled ? "回答已停止" : failed ? "研判执行失败" : result?.degradedReason ? "资料摘要已生成" : "AI 研判已完成"}</b><small>{skillLabel || "通用金融分析"} · {formatClock(message.createdAt)}</small></div>
      <div className="ai-message-actions">
        <button type="button" onClick={onCopy} title="复制回复">{copied ? <Check /> : <Copy />}{copied ? "已复制" : "复制"}</button>
        <button type="button" onClick={onDownload} title="下载 Markdown"><Download />下载</button>
      </div>
    </header>
    {result ? <ResearchResult result={result} /> : <div className="ai-answer-copy"><ReportPreview markdown={message.content} /></div>}
    {progressEvents.length ? <section className="ai-process-block">
      <button type="button" onClick={() => setProcessOpen((value) => !value)} aria-expanded={processOpen}>
        <ChevronRight className={processOpen ? "is-open" : ""} />
        <span>研究过程</span>
        <small>{completedOperations.length} 项执行 · {formatDuration(totalDurationMs)}</small>
      </button>
      {processOpen ? <ProgressEventList events={progressEvents} /> : null}
    </section> : null}
  </article>;
}

function LiveResearchTurn({
  depth,
  progressEvents,
  targetContextLabel,
}: {
  depth: "quick" | "standard" | "deep";
  activeRole: number;
  progressEvents: ResearchProgressEvent[];
  targetContextLabel: string;
}) {
  const latestEvent = progressEvents.at(-1);
  const liveRoles = Array.from(new Set(progressEvents
    .filter((event) => event.displayName && (event.type === "agent_start" || event.type === "agent_done"))
    .map((event) => event.displayName!)));
  const displayedRoles = liveRoles.length ? liveRoles : ["规划 Agent"];
  const quickPipeline = [
    {
      label: "目标识别",
      done: progressEvents.some((event) => event.step >= 2),
      running: !progressEvents.some((event) => event.step >= 2),
    },
    {
      label: "数据源读取",
      done: progressEvents.some((event) => event.type === "tool_done" && ["provider_research_refresh", "native_market_context", "da_stock_provider_bridge"].includes(event.tool ?? "")),
      running: progressEvents.some((event) => event.type === "tool_start" && ["provider_research_refresh", "native_market_context", "da_stock_provider_bridge"].includes(event.tool ?? ""))
        && !progressEvents.some((event) => event.type === "tool_done" && ["provider_research_refresh", "native_market_context", "da_stock_provider_bridge"].includes(event.tool ?? "")),
    },
    {
      label: "证据目录",
      done: progressEvents.some((event) => event.type === "tool_done" && event.tool === "evidence_catalog"),
      running: progressEvents.some((event) => event.type === "tool_start" && event.tool === "evidence_catalog")
        && !progressEvents.some((event) => event.type === "tool_done" && event.tool === "evidence_catalog"),
    },
    {
      label: "联合研判",
      done: progressEvents.some((event) => event.type === "agent_done" && event.stageId === "chief"),
      running: progressEvents.some((event) => event.type === "agent_start" && event.stageId === "chief")
        && !progressEvents.some((event) => event.type === "agent_done" && event.stageId === "chief"),
    },
    {
      label: "引用校验",
      done: false,
      running: progressEvents.some((event) => event.type === "generating"),
    },
  ];
  return <article className="ai-assistant-message ai-research-turn is-live" aria-live="polite">
    <header>
      <span><Sparkles /><i>AI</i></span>
      <div>
        <b>{depth === "quick" ? "协调 Agent 正在快速研判" : "研究团队正在协作"}</b>
        <small>{latestEvent?.message || (depth === "quick" ? "正在建立研究路径" : "正在根据问题生成本轮研究计划")}</small>
      </div>
      <LoaderCircle className="ai-live-spinner" />
    </header>
    <section className="ai-live-overview">
      <p>{targetContextLabel}</p>
      {depth === "quick" ? <div>{quickPipeline.map((stage, index) => <span key={stage.label} className={stage.done ? "is-done" : stage.running ? "is-running" : ""}><i>{stage.done ? <Check /> : index + 1}</i>{stage.label}</span>)}</div> : <div>{displayedRoles.map((role, index) => {
        const hasStarted = progressEvents.some((event) => event.stageId && event.displayName === role);
        const isDone = progressEvents.some((event) => event.type === "agent_done" && event.displayName === role);
        return <span key={role} className={isDone ? "is-done" : hasStarted ? "is-running" : ""}><i>{isDone ? <Check /> : index + 1}</i>{role}</span>;
      })}</div>}
    </section>
    <ProgressEventList events={progressEvents} empty="正在连接研究引擎…" />
  </article>;
}

function ProgressEventList({ events, empty = "" }: { events: ResearchProgressEvent[]; empty?: string }) {
  return <div className="ai-progress-events">
    {events.length ? events.map((event, index) => <div key={`${event.createdAt}-${index}`} className={`is-${event.type} ${event.success === false ? "is-failed" : ""}`}>
      <span>{event.type.startsWith("tool") ? <Wrench /> : event.type === "agent_done" || event.type === "generating" ? <CheckCircle2 /> : event.type === "agent_start" ? <Bot /> : <Sparkles />}</span>
      <p><b>{event.displayName || progressTypeLabel(event.type)}</b><small>{event.message}</small></p>
      <time>{event.durationMs ? formatDuration(event.durationMs) : formatClock(event.createdAt)}</time>
    </div>) : <p className="ai-progress-empty"><LoaderCircle />{empty}</p>}
  </div>;
}

function EvidenceGroup({ title, count, tone, items, empty }: { title: string; count: number; tone: string; items: string[]; empty: string }) {
  return <details className={`ai-evidence-group is-${tone}`} open><summary><b>{title}</b><span>{count} 条 <ChevronRight /></span></summary><ul>{items.length ? items.map((item, index) => <li key={`${tone}-${index}-${item.slice(0, 24)}`}><span />{item}<small>{tone === "counter" ? "反驳" : tone === "pending" ? "待核" : tone === "source" ? "来源" : "支持"}</small></li>) : <li className="is-empty"><span />{empty}<small>待运行</small></li>}</ul></details>;
}

function ResearchResult({ result }: { result: DeepResearchResult }) {
  const sections: ResearchAnswerBlock[] = result.answerBlocks ?? (result.analysisSections ?? []).map((section) => ({ ...section, kind: "analysis" as const }));
  const citations = result.citations ?? [];
  const highCredibilitySources = citations.filter((citation) => citation.credibility === "高").length;
  const visibleAnswer = result.answerMarkdown?.trim() || legacyResearchResultToFreeform(result, sections);
  if (visibleAnswer) {
    return <div className="ai-result-stack ai-research-document is-freeform">
      <article className={`ai-freeform-answer ${result.degradedReason ? "is-degraded" : ""}`}>
        <header><span>AI 研判</span><small>{citations.length
          ? `${citations.length} 条引用 · ${highCredibilitySources} 条高可信`
          : "按问题直接回答"}{result.execution ? ` · ${formatDuration(result.execution.elapsedMs)}` : ""}</small></header>
        <FreeformResearchMarkdown markdown={visibleAnswer} citations={citations} />
        {result.degradedReason ? <footer><ShieldAlert />本次模型生成未完成，正文仅保留可追溯资料，不代表完整研判。</footer> : null}
      </article>
      {result.stages.length ? <details className="ai-agent-audit"><summary><span><Bot />研究过程</span><small>{result.stages.length} 个角色{citations.length && (result.unsupportedClaimCount ?? 0) > 0 ? ` · ${result.unsupportedClaimCount} 条无引用事实未采纳` : " · 可展开查看"}</small></summary><div className="ai-agent-matrix">{result.stages.map((stage) => <AgentStageCard key={stage.id} stage={stage} />)}</div></details> : null}
      {citations.length ? <ResearchSourceLedger citations={citations} /> : null}
    </div>;
  }
  return <div className="ai-result-stack ai-research-document">
    <header className={`ai-answer-lead ${result.degradedReason ? "is-degraded" : ""}`}>
      <div><span>联合研究完成</span><b className={`is-${result.confidence}`}>{result.confidence}置信</b></div>
      <h3>{result.thesis}</h3>
      {result.investmentValue ? <p>{result.investmentValue}</p> : null}
      {result.degradedReason ? <em>降级原因：{result.degradedReason}</em> : null}
      <footer><span>{citations.length} 条来源</span><span>{highCredibilitySources} 条高可信</span><span>{result.stages.length} 个 Agent</span>{result.execution ? <span>{formatDuration(result.execution.elapsedMs)} · {formatCompactToken(result.execution.totalTokens)} Token</span> : null}</footer>
    </header>
    {result.plan ? <details className="ai-research-plan">
      <summary><span><Network />动态研究计划</span><small>{result.plan.tasks.length} 个任务 · {result.plan.answerLayout.length} 个结果块</small><ChevronRight /></summary>
      <header><strong>{result.plan.objective}</strong><p>{result.plan.rationale}</p></header>
      <div>{result.plan.tasks.map((task, index) => <article key={task.id} className={`is-${task.kind}`}><i>{String(index + 1).padStart(2, "0")}</i><span><b>{task.name}</b><small>{sanitizeLegacySourceBrand(task.reason)}</small></span><em>{task.kind === "method" ? "所选方法" : task.kind === "counter" ? "反证" : task.kind === "verification" ? "核验" : "调研"}</em></article>)}</div>
    </details> : null}
    {sections.length ? <section className="ai-dynamic-answer" aria-label="动态研究回答">{sections.map((section, index) => <ResearchNarrativeSection key={`${section.id}-${index}`} section={section} citations={citations} question={result.plan?.answerLayout.find((item) => item.id === section.id)?.question} index={index} total={sections.length} />)}</section> : null}
    {result.decisionDashboard ? <section className="ai-decision-dashboard" aria-label="研究决策面板">
      <header><span>研究决策面板</span><b>{result.decisionDashboard.signal}</b><small>{result.decisionDashboard.timeSensitivity}</small></header>
      <div><article><strong>未持仓</strong><p>{result.decisionDashboard.noPosition}</p></article><article><strong>已持仓</strong><p>{result.decisionDashboard.hasPosition}</p></article></div>
      <footer><strong>后续观察条件</strong>{result.decisionDashboard.watchConditions.map((item, index) => <span key={`${index}-${item}`}>{item}</span>)}</footer>
    </section> : null}
    {result.verificationQuestions.length || result.evidenceBoundary ? <details className="ai-verification-card"><summary><strong>待核验与证据边界</strong><span>{result.verificationQuestions.length} 个问题 <ChevronRight /></span></summary><div>{result.verificationQuestions.map((item, index) => <p key={`${index}-${item}`}><i>{String(index + 1).padStart(2, "0")}</i>{item}</p>)}</div>{result.evidenceBoundary ? <small>{result.evidenceBoundary}</small> : null}</details> : null}
    <details className="ai-agent-audit"><summary><span><Bot />研究过程与 Agent 记录</span><small>{result.stages.length} 个角色 · {result.unsupportedClaimCount ?? 0} 条无引用陈述被拦截</small></summary><div className="ai-agent-matrix">{result.stages.map((stage) => <AgentStageCard key={stage.id} stage={stage} />)}</div></details>
    {citations.length ? <ResearchSourceLedger citations={citations} /> : null}
  </div>;
}

function legacyResearchResultToFreeform(result: DeepResearchResult, sections: ResearchAnswerBlock[]) {
  const withCitations = (text: string, ids: string[] = []) => `${text}${ids.length ? ` ${ids.map((id) => `[${id}]`).join(" ")}` : ""}`;
  const sectionMarkdown = sections.flatMap((section) => {
    const claims = section.narrative?.length
      ? section.narrative
      : section.findingClaims?.length
        ? section.findingClaims
        : section.findings.map((text) => ({ text, citationIds: section.citationIds }));
    if (!claims.length && !section.summary) return [];
    return [
      `## ${section.title}`,
      section.summary ? withCitations(section.summary, section.citationIds) : "",
      ...claims.map((claim) => withCitations(claim.text, claim.citationIds)),
    ].filter(Boolean).join("\n\n");
  });
  const stageFallback = sectionMarkdown.length ? [] : result.stages
    .filter((stage) => stage.summary || stage.findings.length)
    .map((stage) => [stage.summary, ...stage.findings].filter(Boolean).join("\n\n"));
  return [result.thesis, result.investmentValue, ...sectionMarkdown, ...stageFallback].filter(Boolean).join("\n\n").trim();
}

function FreeformResearchMarkdown({ markdown, citations }: { markdown: string; citations: ResearchCitation[] }) {
  const citationMap = new Map(citations.map((citation, index) => [citation.id, { citation, index }]));
  const lines = markdown.split("\n");
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  while (cursor < lines.length) {
    const value = lines[cursor].trim();
    if (!value) { cursor += 1; continue; }
    if (isResearchTableRow(value) && isResearchTableSeparator(lines[cursor + 1]?.trim() ?? "")) {
      const rows: string[][] = [splitMarkdownTableRow(value)];
      cursor += 2;
      while (cursor < lines.length && isResearchTableRow(lines[cursor].trim())) {
        rows.push(splitMarkdownTableRow(lines[cursor].trim()));
        cursor += 1;
      }
      const [head, ...body] = rows;
      nodes.push(<div className="ai-markdown-table-wrap" key={`table-${cursor}`}><table><thead><tr>{head.map((cell, index) => <th key={index}>{renderResearchInline(cell, citationMap)}</th>)}</tr></thead><tbody>{body.map((row, rowIndex) => <tr key={rowIndex}>{head.map((_, cellIndex) => <td key={cellIndex}>{renderResearchInline(row[cellIndex] ?? "", citationMap)}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    const unordered = /^[-*]\s/.test(value);
    const ordered = /^\d+[.)]\s/.test(value);
    if (unordered || ordered) {
      const items: string[] = [];
      while (cursor < lines.length) {
        const item = lines[cursor].trim();
        if (unordered && !/^[-*]\s/.test(item)) break;
        if (ordered && !/^\d+[.)]\s/.test(item)) break;
        items.push(item.replace(unordered ? /^[-*]\s*/ : /^\d+[.)]\s*/, ""));
        cursor += 1;
      }
      nodes.push(unordered
        ? <ul key={`ul-${cursor}`}>{items.map((item, index) => <li key={index}>{renderResearchInline(item, citationMap)}</li>)}</ul>
        : <ol key={`ol-${cursor}`}>{items.map((item, index) => <li key={index}>{renderResearchInline(item, citationMap)}</li>)}</ol>);
      continue;
    }
    if (value.startsWith("### ")) nodes.push(<h4 key={cursor}>{renderResearchInline(value.slice(4), citationMap)}</h4>);
    else if (value.startsWith("## ")) nodes.push(<h3 key={cursor}>{renderResearchInline(value.slice(3), citationMap)}</h3>);
    else if (value.startsWith("# ")) nodes.push(<h2 key={cursor}>{renderResearchInline(value.slice(2), citationMap)}</h2>);
    else if (value.startsWith("> ")) nodes.push(<blockquote key={cursor}>{renderResearchInline(value.slice(2), citationMap)}</blockquote>);
    else nodes.push(<p key={cursor}>{renderResearchInline(value, citationMap)}</p>);
    cursor += 1;
  }
  return <div className="ai-freeform-prose">{nodes}</div>;
}

function isResearchTableRow(value: string) {
  return value.startsWith("|") && value.endsWith("|") && value.split("|").length >= 4;
}

function isResearchTableSeparator(value: string) {
  return isResearchTableRow(value) && splitMarkdownTableRow(value).every((cell) => /^:?-{3,}:?$/.test(cell));
}

function splitMarkdownTableRow(value: string) {
  return value.slice(1, -1).split("|").map((cell) => cell.trim());
}

function renderResearchInline(
  value: string,
  citationMap: Map<string, { citation: ResearchCitation; index: number }>,
) {
  return value.split(/(\*\*[^*]+\*\*|\[[^\]\n]+\])/g).filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={`${index}-${part}`}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("[") && part.endsWith("]")) {
      const id = part.slice(1, -1);
      const row = citationMap.get(id);
      if (!row) return <React.Fragment key={`${index}-${part}`}>{part}</React.Fragment>;
      const label = row.index + 1;
      return row.citation.url
        ? <a key={`${index}-${id}`} href={row.citation.url} target="_blank" rel="noreferrer" title={`${row.citation.title} · ${row.citation.sourceType}`}>[{label}]</a>
        : <span className="ai-inline-citation" key={`${index}-${id}`} title={row.citation.title}>[{label}]</span>;
    }
    return <React.Fragment key={`${index}-${part}`}>{part}</React.Fragment>;
  });
}

function ResearchNarrativeSection({ section, citations, question, index, total }: { section: ResearchAnswerBlock; citations: ResearchCitation[]; question?: string; index: number; total: number }) {
  const narrative = section.narrative?.length ? section.narrative : [];
  const findings = section.findingClaims?.length
    ? section.findingClaims
    : section.findings.map((text) => ({ text, citationIds: section.citationIds }));
  const contentWeight = (section.keyMetrics?.length ?? 0) + narrative.length + findings.length + (section.counterpoints?.length ?? 0) + (section.implications?.length ?? 0);
  const span = index === 0 || total === 1 || contentWeight > 7 || section.kind === "analysis" ? "is-wide" : "is-compact";
  return <article id={`research-block-${safeDomId(section.id)}`} className={`ai-analysis-section is-${section.kind} ${span}`}>
    <header><i>{String(index + 1).padStart(2, "0")}</i><div><h4>{section.title}</h4>{question ? <small>{question}</small> : null}</div><em>{answerBlockKindLabel(section.kind)}</em><b className={`is-${section.confidence ?? "中"}`}>{section.confidence ?? "中"}置信</b></header>
    <p className="ai-section-lede">{formatResearchClaimText(section.summary)}<CitationRefs citationIds={section.citationIds.slice(0, 4)} citations={citations} /></p>
    {(section.keyMetrics?.length ?? 0) > 0 ? <div className="ai-section-metrics">{section.keyMetrics!.map((metric, metricIndex) => <article key={`${metric.label}-${metricIndex}`} className={`is-${metric.direction}`}><span>{metric.label}</span><strong>{metric.value}</strong><p>{metric.context}</p><CitationRefs citationIds={metric.citationIds} citations={citations} /></article>)}</div> : null}
    {narrative.length ? <div className="ai-section-narrative">{narrative.map((claim, claimIndex) => <p key={`${claim.text}-${claimIndex}`}>{formatResearchClaimText(claim.text)}<CitationRefs citationIds={claim.citationIds} citations={citations} /></p>)}</div> : null}
    {findings.length ? <ul className="ai-key-findings">{findings.map((claim, claimIndex) => <li key={`${claim.text}-${claimIndex}`}><p>{formatResearchClaimText(claim.text)}<CitationRefs citationIds={claim.citationIds} citations={citations} /></p></li>)}</ul> : null}
    {(section.counterpoints?.length ?? 0) > 0 ? <section className="ai-counterpoint-panel"><strong>反方证据 / 替代解释</strong>{section.counterpoints!.map((claim, claimIndex) => <p key={`${claim.text}-${claimIndex}`}>{formatResearchClaimText(claim.text)}<CitationRefs citationIds={claim.citationIds} citations={citations} /></p>)}</section> : null}
    {(section.implications?.length ?? 0) > 0 ? <section className="ai-implication-panel"><strong>这意味着什么</strong>{section.implications!.map((claim, claimIndex) => <p key={`${claim.text}-${claimIndex}`}>{formatResearchClaimText(claim.text)}<CitationRefs citationIds={claim.citationIds} citations={citations} /></p>)}</section> : null}
  </article>;
}

function formatResearchClaimText(value: string) {
  if (!value.includes("changePercent") || !value.includes("name")) return value;
  const rows = [...value.matchAll(/name["：:、]+\s*([^,"、}]+)[^}]*?changePercent["：:、]+\s*(-?\d+(?:\.\d+)?)[^}]*?upCount["：:、]+\s*(\d+)[^}]*?downCount["：:、]+\s*(\d+)/g)]
    .slice(0, 5)
    .map((match) => `${match[1]} ${Number(match[2]) >= 0 ? "+" : ""}${match[2]}%（上涨 ${match[3]} / 下跌 ${match[4]}）`);
  return rows.length ? `行业涨跌样本：${rows.join("；")}。` : value;
}

function CitationRefs({ citationIds, citations }: { citationIds: string[]; citations: ResearchCitation[] }) {
  const uniqueIds = [...new Set(citationIds)].slice(0, 6);
  if (!uniqueIds.length) return null;
  return <span className="ai-inline-citations">{uniqueIds.map((id) => {
    const citationIndex = citations.findIndex((citation) => citation.id === id);
    const citation = citationIndex >= 0 ? citations[citationIndex] : undefined;
    const label = citationIndex >= 0 ? citationIndex + 1 : id.replace(/^.*:/, "").slice(0, 4);
    return citation?.url ? <a key={id} href={citation.url} target="_blank" rel="noreferrer" title={`${citation.title} · ${citation.sourceType}`}>[{label}]</a> : <span key={id} title={citation?.title ?? id}>[{label}]</span>;
  })}</span>;
}

function ResearchSourceLedger({ citations }: { citations: ResearchCitation[] }) {
  return <details className="ai-source-ledger"><summary><span><BookOpenCheck />来源与证据账本</span><small>{citations.length} 条已实际用于正文</small><ChevronRight /></summary><div>{citations.map((citation, index) => <article key={citation.id}><i>{String(index + 1).padStart(2, "0")}</i><div><b>{citation.title}</b><span>{citation.sourceType}{citation.sourceDate ? ` · ${formatResearchDate(citation.sourceDate)}` : ""}</span><p>{citation.excerpt}</p></div><em className={`is-${citation.credibility}`}>{citation.credibility}可信</em>{citation.url ? <a href={citation.url} target="_blank" rel="noreferrer" aria-label={`打开来源 ${citation.title}`}><ExternalLink /></a> : null}</article>)}</div></details>;
}

function safeDomId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-");
}

function formatResearchDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : date.toLocaleDateString("zh-CN");
}

function answerBlockKindLabel(kind: NonNullable<DeepResearchResult["answerBlocks"]>[number]["kind"]) {
  return {
    analysis: "分析",
    method: "方法",
    comparison: "对比",
    scenario: "情景",
    risk: "反证",
    evidence: "证据",
    checklist: "核验",
  }[kind];
}

function AgentStageCard({ stage }: { stage: ResearchAgentStage }) {
  return <details className="ai-agent-card" open={stage.id === "chief"}><summary><span><Bot />{stage.name}</span><b>{stage.confidence}置信 · {stage.citationIds?.length ?? 0} 引用</b></summary><p>{stage.summary}</p>{stage.findings.length ? <ul>{stage.findings.map((item, index) => <li key={`${stage.id}-${index}-${item}`}>{item}</li>)}</ul> : <p className="ai-agent-no-finding">没有通过引用校验的发现</p>}{stage.evidenceGaps.length ? <small>证据缺口：{stage.evidenceGaps.join("；")}</small> : null}</details>;
}

export function ReportPreview({ markdown }: { markdown: string }) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const fence = line.match(/^```([^\s`]*)\s*$/);
    if (fence) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) code.push(lines[index++]);
      if (index < lines.length) index += 1;
      blocks.push(<pre key={`code-${index}`}><code data-language={fence[1] || undefined}>{code.join("\n")}</code></pre>);
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const content = renderMarkdownInline(heading[2], `heading-${index}`);
      blocks.push(heading[1].length === 1
        ? <h2 key={`heading-${index}`}>{content}</h2>
        : heading[1].length === 2
          ? <h3 key={`heading-${index}`}>{content}</h3>
          : <h4 key={`heading-${index}`}>{content}</h4>);
      index += 1;
      continue;
    }
    if (/^\s*(?:---+|___+|\*\*\*+)\s*$/.test(line)) {
      blocks.push(<hr key={`hr-${index}`} />);
      index += 1;
      continue;
    }
    if (line.includes("|") && index + 1 < lines.length && isMarkdownTableSeparator(lines[index + 1])) {
      const headers = markdownTableCells(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) rows.push(markdownTableCells(lines[index++]));
      blocks.push(<div className="markdown-table-wrap" key={`table-${index}`}><table><thead><tr>{headers.map((cell, cellIndex) => <th key={cellIndex}>{renderMarkdownInline(cell, `th-${index}-${cellIndex}`)}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{headers.map((_, cellIndex) => <td key={cellIndex}>{renderMarkdownInline(row[cellIndex] ?? "", `td-${rowIndex}-${cellIndex}`)}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^>\s?/, ""));
      blocks.push(<blockquote key={`quote-${index}`}>{quote.map((value, quoteIndex) => <p key={quoteIndex}>{renderMarkdownInline(value, `quote-${index}-${quoteIndex}`)}</p>)}</blockquote>);
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) items.push(lines[index++].replace(/^\s*[-*+]\s+/, ""));
      blocks.push(<ul key={`ul-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}>{renderMarkdownInline(item, `ul-${index}-${itemIndex}`)}</li>)}</ul>);
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) items.push(lines[index++].replace(/^\s*\d+[.)]\s+/, ""));
      blocks.push(<ol key={`ol-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}>{renderMarkdownInline(item, `ol-${index}-${itemIndex}`)}</li>)}</ol>);
      continue;
    }
    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim() && !isMarkdownBlockStart(lines, index)) paragraph.push(lines[index++].trim());
    blocks.push(<p key={`p-${index}`}>{renderMarkdownInline(paragraph.join(" "), `p-${index}`)}</p>);
  }
  return <article className="markdown-report">{blocks}</article>;
}

function renderMarkdownInline(value: string, keyPrefix: string) {
  const tokens = value.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g).filter(Boolean);
  return tokens.map((token, index) => {
    if (token.startsWith("**") && token.endsWith("**")) return <strong key={`${keyPrefix}-${index}`}>{token.slice(2, -2)}</strong>;
    if (token.startsWith("`") && token.endsWith("`")) return <code key={`${keyPrefix}-${index}`}>{token.slice(1, -1)}</code>;
    const link = token.match(/^\[([^\]]+)]\(([^)]+)\)$/);
    if (link) {
      const href = /^(?:https?:\/\/|#)/i.test(link[2]) ? link[2] : "#";
      return <a key={`${keyPrefix}-${index}`} href={href} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noreferrer" : undefined}>{link[1]}</a>;
    }
    return <React.Fragment key={`${keyPrefix}-${index}`}>{token}</React.Fragment>;
  });
}

function markdownTableCells(value: string) {
  return value.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
}

function isMarkdownTableSeparator(value: string) {
  const cells = markdownTableCells(value);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function isMarkdownBlockStart(lines: string[], index: number) {
  const value = lines[index];
  return /^#{1,4}\s+|^```|^>\s?|^\s*[-*+]\s+|^\s*\d+[.)]\s+|^\s*(?:---+|___+|\*\*\*+)\s*$/.test(value)
    || (value.includes("|") && index + 1 < lines.length && isMarkdownTableSeparator(lines[index + 1]));
}

function flattenCategories(nodes: CategoryLookupNode[]): CategoryLookupNode[] {
  return nodes.flatMap((node) => [node, ...flattenCategories(node.children ?? [])]);
}

function findCategoryMention(nodes: CategoryLookupNode[], value: string) {
  const normalized = value.trim().toLocaleLowerCase();
  if (!normalized) return null;
  return flattenCategories(nodes)
    .map((category) => ({
      category,
      matchedLength: Math.max(
        0,
        ...[category.name, ...category.aliases]
          .map((name) => name.trim().toLocaleLowerCase())
          .filter((name) => name.length >= 2 && normalized.includes(name))
          .map((name) => name.length),
      ),
    }))
    .filter((item) => item.matchedLength > 0)
    .sort((left, right) => right.matchedLength - left.matchedLength)[0]?.category ?? null;
}

function shouldContinueTargetContext(prompt: string, target: IntelligenceTarget | null, messageCount: number) {
  if (!target || messageCount === 0) return false;
  const normalized = prompt.trim().toLocaleLowerCase();
  const targetNames = [target.companyName, target.stockCode]
    .map((value) => value.trim().toLocaleLowerCase())
    .filter(Boolean);
  if (targetNames.some((name) => normalized.includes(name))) return true;
  if (/^(?:继续|再|那么|那|上述|前面|它|其|该公司|这家公司|这个行业|该行业|这个标的)/.test(normalized)) return true;
  return normalized.length <= 24
    && /(?:呢|吗|如何|怎么看|为什么|风险|估值|趋势|基本面|技术面|财务|业务|催化|支撑|压力|仓位)[？?]?$/.test(normalized);
}

function questionKey(value: string) {
  let hash = 2166136261;
  for (const character of value.trim()) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `question-${(hash >>> 0).toString(16)}`;
}

function isGreetingPrompt(value: string) {
  return /^(你好|您好|嗨|哈喽|hello|hi|在吗|测试一下|测试)$/i.test(value.trim());
}

function sanitizeLegacySourceBrand(value: string) {
  return value
    .replace(/对应 DA-Stock 问股的 get_market_indices 工具与大盘研判路径。/gi, "对应主要指数工具与大盘研判路径。")
    .replace(/对应 DA-Stock 问股的 get_sector_rankings 工具。/gi, "对应行业强弱与板块轮动工具。")
    .replace(/DA-Stock/gi, "统一研究引擎");
}

function dialogTitle(dialog: "guide" | "settings" | "context" | "sources") {
  if (dialog === "guide") return "AI 研究使用指南";
  if (dialog === "settings") return "研究设置与策略";
  if (dialog === "sources") return "研究数据源与证据规则";
  return "添加研究上下文";
}

function formatCompactToken(value: number) {
  return value >= 1000 ? `${(value / 1000).toFixed(value >= 10_000 ? 1 : 2).replace(/\.0+$/, "")}K` : String(value);
}

function formatDuration(value: number) {
  if (value <= 0) return "已记录";
  return value < 1000 ? `${value}ms` : `${(value / 1000).toFixed(1)}s`;
}

function progressTypeLabel(type: ResearchProgressEvent["type"]) {
  return {
    thinking: "研究规划",
    tool_start: "工具调用",
    tool_done: "工具完成",
    agent_start: "智能体执行",
    agent_done: "智能体完成",
    generating: "结论生成",
  }[type];
}

function resultToClientMarkdown(result: DeepResearchResult) {
  const answerBlocks: ResearchAnswerBlock[] = result.answerBlocks
    ?? (result.analysisSections ?? []).map((section) => ({ ...section, kind: "analysis" as const }));
  const withCitations = (text: string, citationIds: string[] = []) => `${text}${citationIds.length ? ` ${citationIds.map((id) => `[${id}]`).join(" ")}` : ""}`;
  return [
    `## 联合结论（${result.confidence}置信）`,
    result.thesis,
    result.investmentValue,
    ...(result.plan ? [
      "### 本轮动态研究计划",
      result.plan.rationale,
      ...result.plan.tasks.map((task) => `- **${task.name}**：${task.mission}（${sanitizeLegacySourceBrand(task.reason)}）`),
    ] : []),
    ...answerBlocks.flatMap((section) => [
      `### ${section.title}`,
      withCitations(section.summary, section.citationIds),
      ...((section.keyMetrics?.length ?? 0) ? [
        "#### 关键指标",
        ...section.keyMetrics!.map((metric) => `- **${metric.label}：${metric.value}** — ${withCitations(metric.context, metric.citationIds)}`),
      ] : []),
      ...(section.narrative ?? []).map((claim) => withCitations(claim.text, claim.citationIds)),
      ...((section.findingClaims?.length ?? 0) ? [
        "#### 关键判断",
        ...section.findingClaims!.map((claim) => `- ${withCitations(claim.text, claim.citationIds)}`),
      ] : section.findings.map((finding) => `- ${finding}`)),
      ...((section.counterpoints?.length ?? 0) ? [
        "#### 反方证据与替代解释",
        ...section.counterpoints!.map((claim) => `- ${withCitations(claim.text, claim.citationIds)}`),
      ] : []),
      ...((section.implications?.length ?? 0) ? [
        "#### 研究含义",
        ...section.implications!.map((claim) => `- ${withCitations(claim.text, claim.citationIds)}`),
      ] : []),
    ]),
    ...(result.decisionDashboard ? [
      "### 研究决策面板",
      `- 信号：${result.decisionDashboard.signal}`,
      `- 时效：${result.decisionDashboard.timeSensitivity}`,
      `- 未持仓：${result.decisionDashboard.noPosition}`,
      `- 已持仓：${result.decisionDashboard.hasPosition}`,
      ...result.decisionDashboard.watchConditions.map((item) => `- 观察条件：${item}`),
    ] : []),
    "### 分角色研判与主审记录",
    ...result.stages.flatMap((stage) => [
      `### ${stage.name}`,
      stage.summary,
      ...stage.findings.map((finding) => `- ${finding}`),
      ...stage.evidenceGaps.map((gap) => `- 待核验：${gap}`),
    ]),
    "### 风险与反证",
    ...result.risks.map((risk) => `- ${risk}`),
    "### 下一步核验",
    ...result.verificationQuestions.map((question) => `- ${question}`),
    "### 来源与证据账本",
    ...(result.citations ?? []).map((citation, index) => `${index + 1}. **${citation.title}**（${citation.sourceType}${citation.sourceDate ? `，${citation.sourceDate}` : ""}；${citation.credibility}可信）\n   - ${citation.excerpt}${citation.url ? `\n   - ${citation.url}` : ""}`),
  ].join("\n\n");
}

function parseComparisonCodes(value: string) {
  return [...new Set(value.split(/[\s,，、;；]+/).map((item) => item.trim()).filter((item) => /^\d{6}$/.test(item)))];
}

function reportSubjectKey(target: IntelligenceTarget | null, reportType: ResearchReportType, comparisonCodes: string) {
  if (!target) return "";
  if (reportType === "company") return target.targetType === "company" ? target.stockCode : "";
  if (reportType === "industry") return target.categoryId ? String(target.categoryId) : "";
  if (reportType === "comparison") {
    const codes = [...new Set([target.stockCode, ...parseComparisonCodes(comparisonCodes)].filter((code) => /^\d{6}$/.test(code)))];
    return codes.length >= 2 ? [...codes].sort().join("-") : "";
  }
  return target.subjectKey;
}

function targetTitle(target: IntelligenceTarget) {
  if (target.targetType === "company") return `${target.companyName} · ${target.stockCode}`;
  return `${target.companyName} · ${target.targetType === "industry" ? "产业研究" : "开放问题"}`;
}

function createResearchSessionId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `research-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function inferExternalSecurityQuery(value: string) {
  const hk = value.match(/(?:HK\s*[:.-]?\s*|港股\s*)(\d{4,5})\b/i)
    ?? value.match(/\b(\d{4,5})\s*(?:\.HK|HK)\b/i);
  if (hk?.[1]) {
    const code = hk[1].padStart(5, "0");
    const name = value.match(/(?:分析|研究|看看|看下|查询|用[^\s]{1,8}分析)?\s*([\u4e00-\u9fa5A-Za-z]{2,12})\s*(?:HK|港股)/i)?.[1]
      ?.replace(/^(?:分析|研究|看看|看下|查询)/, "");
    return { market: "HK", code, label: `${name || "港股"} · HK ${code}` };
  }
  const us = value.match(/(?:美股\s*|US\s*[:.-]?\s*)([A-Z]{1,6})\b/i)
    ?? value.match(/\b([A-Z]{1,6})\s*(?:\.US|US)\b/i);
  if (us?.[1]) {
    const code = us[1].toUpperCase();
    return { market: "US", code, label: `美股 · ${code}` };
  }
  return null;
}

async function recoverCompletedResearch(
  activeSessionId: string,
  target: IntelligenceTarget,
  prompt: string,
  depth: "quick" | "standard" | "deep",
  signal: AbortSignal,
  maxAttempts = 16,
): Promise<{ sessionId: string; run: ResearchRun } | null> {
  for (let attempt = 0; attempt < maxAttempts && !signal.aborted; attempt += 1) {
    if (attempt > 0) await waitForRecovery(5_000);
    if (signal.aborted) return null;
    const response = await fetch(`/api/ai/research/sessions/${encodeURIComponent(activeSessionId)}`, {
      cache: "no-store",
      signal,
    }).catch(() => null);
    if (!response?.ok) continue;
    const payload = await response.json().catch(() => null) as {
      session?: ResearchConversationSession;
      messages?: ResearchConversationMessage[];
    } | null;
    const result = [...(payload?.messages ?? [])]
      .reverse()
      .find((message) => message.role === "assistant" && message.metadata.result)
      ?.metadata.result;
    if (!result) continue;
    const session = payload?.session ?? {
      sessionId: activeSessionId,
      title: prompt,
      targetType: target.targetType,
      subjectKey: target.subjectKey,
      subjectLabel: target.companyName,
      stockCode: target.stockCode,
      categoryId: target.categoryId,
      depth,
      skills: [],
      context: {},
      messageCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const run = researchRunFromSessionResult(session, prompt, result);
    return { sessionId: activeSessionId, run };
  }
  return null;
}

function researchRunFromSessionResult(
  session: ResearchConversationSession,
  question: string,
  result: DeepResearchResult,
): ResearchRun {
  const common = {
    id: 0,
    categoryId: session.categoryId,
    question,
    depth: session.depth,
    status: "completed",
    model: result.model,
    result,
    error: "",
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
  return session.targetType === "company"
    ? { ...common, stockCode: session.stockCode }
    : {
      ...common,
      subjectType: session.targetType,
      subjectKey: session.subjectKey,
      subjectLabel: session.subjectLabel,
    };
}

function waitForRecovery(durationMs: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, durationMs));
}

function formatRelativeTime(value: string) {
  const timestamp = new Date(value.replace(" ", "T") + (value.includes("Z") || /[+-]\d\d:\d\d$/.test(value) ? "" : "Z")).getTime();
  if (!Number.isFinite(timestamp)) return "最近";
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  if (minutes < 1_440) return `${Math.floor(minutes / 60)}小时前`;
  return `${Math.floor(minutes / 1_440)}天前`;
}

function formatCalendarDate(value: string) {
  const normalized = value.replace(" ", "T") + (value.includes("Z") || /[+-]\d\d:\d\d$/.test(value) ? "" : "Z");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "最近";
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

function formatClock(value: string) {
  const date = new Date(value.replace(" ", "T") + (value.includes("Z") || /[+-]\d\d:\d\d$/.test(value) ? "" : "Z"));
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function toolLabel(value: string) {
  const localLabel = {
    unified_company_profile: "公司档案",
    industry_graph: "产业链图谱",
    evidence_catalog: "证据目录",
    daily_technical_analysis: "日线技术分析",
  }[value];
  return localLabel ?? getDAStockToolName(value);
}
