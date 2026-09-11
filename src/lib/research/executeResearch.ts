import {
  buildEvidenceFallbackResearchResult,
  runDeepResearchTeam,
  type ResearchDepth,
} from "@/lib/agents/deepseekResearchAgent";
import { inferResearchSkillIds, resolveResearchSkills } from "@/lib/agents/researchSkills";
import {
  fetchEastmoneyMarketTechnicalSnapshots,
  fetchEastmoneyTechnicalSnapshot,
} from "@/lib/datasources/eastmoneyTechnicalProvider";
import {
  fetchDAStockExternalResearchFacts,
  fetchDAStockOpenResearchFacts,
  isDAStockDataSourceConfigured,
  refreshDAStockResearchFacts,
} from "@/lib/datasources/daStockDataSourceProvider";
import {
  fetchEastmoneyMarketBreadth,
  fetchEastmoneyMarketNews,
  fetchEastmoneySectorRankings,
  fetchTencentMarketIndices,
  isNativeResearchDataSourceConfigured,
  refreshNativeResearchFacts,
} from "@/lib/datasources/daStockNativeResearchProvider";
import { resolveStockMention, resolveStockQuery } from "@/lib/datasources/stockLookup";
import { getDatabase } from "@/lib/db/client";
import {
  addResearchMessage,
  getResearchSession,
  saveResearchRun,
  saveUniversalResearchRun,
  upsertResearchSession,
  type StoredResearchRun,
  type StoredUniversalResearchRun,
} from "@/lib/repositories/aiResearch";
import {
  buildCompanyResearchFacts,
  buildIndustryResearchFacts,
  buildOpenQuestionResearchFacts,
} from "@/lib/research/companyFacts";
import { refreshCompanyProviderFacts } from "@/lib/research/companyProfileSync";
import { ensureResearchCompany } from "@/lib/research/ensureResearchCompany";
import { findStoredCompanyMention, findStoredCompanyQuery } from "@/lib/repositories/companies";
import { buildResearchEvidenceCatalog } from "@/lib/research/researchEvidenceCatalog";
import {
  createResearchProgressEvent,
  type ResearchProgressEvent,
} from "@/lib/research/researchProgress";
import { inferMarketResearchTarget, inferStandaloneStockQuery } from "@/lib/research/researchTarget";
import { buildResearchConversationContext } from "@/lib/research/researchConversationContext";
import type { ResearchAnswerBlock } from "@/lib/research/researchPlanning";
import { sanitizePublicFacingPayload, sanitizePublicReportText } from "@/lib/research/publicReportBrand";

export type ResearchRequestBody = {
  targetType?: unknown;
  subjectLabel?: unknown;
  subjectKey?: unknown;
  stockCode?: unknown;
  categoryId?: unknown;
  question?: unknown;
  depth?: unknown;
  sessionId?: unknown;
  skills?: unknown;
  context?: unknown;
  contextCompression?: unknown;
};

export type ResearchRequestOutcome = {
  sessionId: string;
  run: StoredResearchRun | StoredUniversalResearchRun;
};

export class ResearchRequestError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
    this.name = "ResearchRequestError";
  }
}

export async function executeResearch(
  body: ResearchRequestBody,
  options: {
    onProgress?: (event: ResearchProgressEvent) => void;
    signal?: AbortSignal;
  } = {},
): Promise<ResearchRequestOutcome> {
  let failedConversation: { sessionId: string } | null = null;
  const progressEvents: ResearchProgressEvent[] = [];
  const emit = (event: Omit<ResearchProgressEvent, "createdAt">) => {
    const progressEvent = createResearchProgressEvent(sanitizePublicFacingPayload(event));
    progressEvents.push(progressEvent);
    options.onProgress?.(progressEvent);
  };

  try {
    const db = getDatabase();
    let sessionId = typeof body.sessionId === "string" && /^[a-zA-Z0-9_-]{8,80}$/.test(body.sessionId)
      ? body.sessionId
      : crypto.randomUUID();
    let existingConversation = getResearchSession(db, sessionId);
    let targetType = body.targetType === "company" || body.targetType === "industry" || body.targetType === "question"
      ? body.targetType
      : existingConversation?.session.targetType ?? "company";
    let stockCode = typeof body.stockCode === "string" ? body.stockCode.trim() : "";
    let categoryId = typeof body.categoryId === "number" ? body.categoryId : null;
    const question = typeof body.question === "string" ? body.question.trim() : "";
    let subjectLabel = typeof body.subjectLabel === "string" ? body.subjectLabel.trim() : "";
    let subjectKey = typeof body.subjectKey === "string" ? body.subjectKey.trim() : "";
    if (!question) throw new ResearchRequestError("研究问题不能为空", 400);
    if (!stockCode && targetType === "company") stockCode = existingConversation?.session.stockCode ?? "";
    if (categoryId === null && targetType === "industry") categoryId = existingConversation?.session.categoryId ?? null;
    if (!subjectLabel) subjectLabel = existingConversation?.session.subjectLabel ?? "";
    if (!subjectKey) subjectKey = existingConversation?.session.subjectKey ?? "";
    const inheritedDepth = existingConversation?.session.depth;
    const depth: ResearchDepth = body.depth === "quick" || body.depth === "deep" || body.depth === "standard"
      ? body.depth
      : inheritedDepth === "quick" || inheritedDepth === "deep" ? inheritedDepth : "standard";
    const submittedSkillIds = Array.isArray(body.skills)
      ? body.skills.filter((item): item is string => typeof item === "string")
      : existingConversation?.session.skills ?? [];
    const inferredSkillIds = inferResearchSkillIds(question);
    // DA-Stock treats the checkbox selection as a request-level contract.
    // Natural-language method names are added at higher priority, but must not
    // erase other methods that the user explicitly selected in the UI.
    const skills = resolveResearchSkills([...inferredSkillIds, ...submittedSkillIds]);
    const inheritedContext = existingConversation?.session.context ?? {};
    const context = { ...inheritedContext, ...(isRecord(body.context) ? body.context : {}) };
    const contextCompression = typeof body.contextCompression === "boolean"
      ? body.contextCompression
      : inheritedContext.contextCompression === true;

    emit({ type: "thinking", step: 1, message: "正在识别研究目标并准备会话上下文" });
    let facts;
    let inferredCompanyName = "";
    const marketTarget = inferMarketResearchTarget(question);
    const storedMention = findStoredCompanyMention(db, question);
    const explicitlyMentionedStock = resolveStockMention(question) ?? (storedMention ? {
      canonicalCode: storedMention.stockCode,
      displayCode: storedMention.stockCode,
      nameZh: storedMention.shortName,
    } : undefined);
    const marketResearch = marketTarget && !explicitlyMentionedStock ? marketTarget : null;
    if (marketResearch) {
      targetType = "question";
      stockCode = "";
      categoryId = null;
      subjectKey = marketResearch.key;
      subjectLabel = marketResearch.label;
      emit({
        type: "thinking",
        step: 1,
        message: "识别到A股大盘问题，已切换市场研究上下文",
      });
    }
    const inferredQuery = inferStandaloneStockQuery(question);
    const storedQuery = inferredQuery ? findStoredCompanyQuery(db, inferredQuery) : undefined;
    const inferredStock = marketResearch ? null : inferredQuery
      ? resolveStockQuery(inferredQuery) ?? (storedQuery ? {
        canonicalCode: storedQuery.stockCode,
        displayCode: storedQuery.stockCode,
        nameZh: storedQuery.shortName,
      } : undefined)
      : explicitlyMentionedStock;
    inferredCompanyName = inferredQuery ? inferredStock?.nameZh || "" : "";
    if (inferredStock && inferredStock.displayCode !== stockCode) {
      targetType = "company";
      stockCode = inferredStock.displayCode;
      subjectKey = inferredStock.displayCode;
      subjectLabel = inferredStock.nameZh || inferredStock.displayCode;
      categoryId = null;
      emit({
        type: "thinking",
        step: 1,
        message: `识别到新标的 ${subjectLabel}（${stockCode}），已切换独立研究上下文`,
      });
    }
    const sessionTargetChanged = existingConversation && (
      existingConversation.session.targetType !== targetType
      || (targetType === "company" && existingConversation.session.stockCode !== stockCode)
      || (targetType === "industry" && existingConversation.session.categoryId !== categoryId)
      || (targetType === "question" && subjectKey && existingConversation.session.subjectKey !== subjectKey)
    );
    if (sessionTargetChanged) {
      sessionId = crypto.randomUUID();
      existingConversation = null;
      emit({
        type: "thinking",
        step: 1,
        message: "研究目标已变化，已隔离旧会话上下文",
      });
    }

    if (targetType === "company") {
      if (!/^\d{6}$/.test(stockCode)) throw new ResearchRequestError("股票代码无效", 400);
      await ensureResearchCompany(db, stockCode);
      facts = buildCompanyResearchFacts(db, stockCode, categoryId);
      if (facts && isNativeResearchDataSourceConfigured()) {
        const refreshStartedAt = Date.now();
        emit({
          type: "tool_start",
          step: 2,
          message: "正在同步公司、财务、行情、公告与研报数据",
          tool: "provider_research_refresh",
          displayName: "研究资料同步",
        });
        try {
          const refresh = await refreshCompanyProviderFacts(db, stockCode);
          facts = buildCompanyResearchFacts(db, stockCode, categoryId);
          const citationCount = facts ? buildResearchEvidenceCatalog(facts).length : 0;
          emit({
            type: "tool_done",
            step: 2,
            message: citationCount > 0
              ? `已从 ${refresh.successfulProviders.length} 个数据源载入 ${citationCount} 条可引用资料`
              : "数据源已完成尝试，但当前仍没有可引用资料",
            tool: "provider_research_refresh",
            displayName: "研究资料同步",
            success: citationCount > 0,
            durationMs: Date.now() - refreshStartedAt,
          });
        } catch (error) {
          emit({
            type: "tool_done",
            step: 2,
            message: `研究资料同步暂不可用：${publicProviderRefreshErrorMessage(error)}`,
            tool: "provider_research_refresh",
            displayName: "研究资料同步",
            success: false,
            durationMs: Date.now() - refreshStartedAt,
          });
        }
      }
      if (facts) {
        const nativeStartedAt = Date.now();
        emit({
          type: "tool_start",
          step: 2,
          message: "正在读取主要指数、行业强弱与个股资金流",
          tool: "native_market_context",
          displayName: "市场与资金环境",
        });
        try {
          const native = await refreshNativeResearchFacts(db, stockCode);
          facts = buildCompanyResearchFacts(db, stockCode, categoryId);
          emit({
            type: "tool_done",
            step: 2,
            message: native.fromCache
              ? `已复用市场环境缓存（${native.successfulProviders.length} 个来源）`
              : `市场环境已完成：${native.successfulProviders.length} 个成功，${native.failedProviders.length} 个待重试`,
            tool: "native_market_context",
            displayName: "市场与资金环境",
            success: native.successfulProviders.length > 0,
            durationMs: Date.now() - nativeStartedAt,
          });
        } catch (error) {
          emit({
            type: "tool_done",
            step: 2,
            message: `市场环境数据暂不可用：${publicProviderRefreshErrorMessage(error)}`,
            tool: "native_market_context",
            displayName: "市场与资金环境",
            success: false,
            durationMs: Date.now() - nativeStartedAt,
          });
        }
      }
      if (facts && isDAStockDataSourceConfigured()) {
        const bridgeStartedAt = Date.now();
        emit({
          type: "tool_start",
          step: 2,
          message: "正在读取已配置的行情与新闻检索数据源",
          tool: "da_stock_provider_bridge",
          displayName: "行情与新闻数据源",
        });
        try {
          const bridge = await refreshDAStockResearchFacts(
            db,
            stockCode,
            String(facts.subject?.label || inferredCompanyName || stockCode),
          );
          facts = buildCompanyResearchFacts(db, stockCode, categoryId);
          emit({
            type: "tool_done",
            step: 2,
            message: bridge.fromCache
              ? `已复用行情与新闻数据缓存（${bridge.successfulProviders.length} 个来源）`
              : `行情与新闻数据读取完成：${bridge.successfulProviders.length} 个成功，${bridge.failedProviders.length} 个待重试`,
            tool: "da_stock_provider_bridge",
            displayName: "行情与新闻数据源",
            success: bridge.successfulProviders.length > 0,
            durationMs: Date.now() - bridgeStartedAt,
          });
        } catch (error) {
          emit({
            type: "tool_done",
            step: 2,
            message: `行情与新闻数据暂不可用：${publicProviderRefreshErrorMessage(error)}`,
            tool: "da_stock_provider_bridge",
            displayName: "行情与新闻数据源",
            success: false,
            durationMs: Date.now() - bridgeStartedAt,
          });
        }
      }
      // Strategies are optional. In DA-Stock the model can still call market tools
      // when the natural-language question asks about price, trend, volume or a
      // trading level. Do the same here instead of coupling K-line retrieval to
      // an explicitly selected analysis method.
      if (facts && shouldLoadCompanyTechnicalData(question, skills.map((skill) => skill.id))) {
        const technicalStartedAt = Date.now();
        emit({
          type: "tool_start",
          step: 2,
          message: "正在读取日线行情与技术指标",
          tool: "daily_technical_analysis",
          displayName: "日线技术分析",
        });
        try {
          const technicalSnapshot = await fetchEastmoneyTechnicalSnapshot(stockCode);
          facts.fieldFacts.push({
            fieldKey: "technicalSnapshot",
            value: technicalSnapshot,
            status: "available",
            provider: technicalSnapshot.source === "tencent_kline" ? "Tencent Kline" : "Eastmoney Kline",
            sourceUrl: technicalSnapshot.sourceUrl,
            confidence: "high",
            verificationStatus: "unverified",
            fetchedAt: technicalSnapshot.fetchedAt,
          });
          emit({
            type: "tool_done",
            step: 2,
            message: "日线行情与技术指标已载入",
            tool: "daily_technical_analysis",
            displayName: "日线技术分析",
            success: true,
            durationMs: Date.now() - technicalStartedAt,
          });
        } catch (error) {
          const message = publicDataSourceErrorMessage(error);
          facts.fieldFacts.push({
            fieldKey: "technicalSnapshot",
            value: { error: message },
            status: "failed",
            provider: "Eastmoney Kline",
            sourceUrl: "",
            confidence: "low",
            verificationStatus: "unverified",
            fetchedAt: new Date().toISOString(),
          });
          emit({
            type: "tool_done",
            step: 2,
            message: `技术数据不可用：${message}`,
            tool: "daily_technical_analysis",
            displayName: "日线技术分析",
            success: false,
            durationMs: Date.now() - technicalStartedAt,
          });
        }
      }
    } else if (targetType === "industry") {
      if (!categoryId) throw new ResearchRequestError("产业分类无效", 400);
      facts = buildIndustryResearchFacts(db, categoryId);
    } else {
      if (!question) throw new ResearchRequestError("开放研究问题不能为空", 400);
      facts = buildOpenQuestionResearchFacts(question);
      if (marketResearch) {
        facts.subject = { kind: "question", label: marketResearch.label, key: marketResearch.key };
        facts.company = {
          subjectType: "market",
          market: marketResearch.market,
          label: marketResearch.label,
          question,
        };
        const marketFetch = (input: RequestInfo | URL, init?: RequestInit) => fetch(input, {
          ...init,
          signal: combineAbortSignals(init?.signal, options.signal),
        });
        const marketStartedAt = Date.now();
        emit({
          type: "tool_start",
          step: 2,
          message: "正在调用大盘指数、板块排名与市场情报工具",
          tool: "get_market_indices",
          displayName: "A股市场工具",
        });
        const [indicesResult, sectorsResult, breadthResult, technicalResult, directNewsResult, newsResult] = await Promise.allSettled([
          fetchTencentMarketIndices(marketFetch),
          fetchEastmoneySectorRankings(marketFetch, 12),
          fetchEastmoneyMarketBreadth(marketFetch),
          fetchEastmoneyMarketTechnicalSnapshots(marketFetch, 160),
          fetchEastmoneyMarketNews(marketFetch, 12),
          fetchDAStockOpenResearchFacts(
            `A股 大盘 盘面 市场走势 政策 资金面 行业轮动 ${question}`,
            { limit: 10, days: 7, fieldPrefix: "marketNews", excludeCommunity: true, trustedPublishersOnly: true },
          ),
        ]);
        if (indicesResult.status === "fulfilled") {
          facts.fieldFacts.push({
            fieldKey: "marketIndices",
            value: indicesResult.value.indices,
            status: "available",
            provider: "腾讯财经主要指数",
            sourceUrl: indicesResult.value.sourceUrl,
            confidence: "high",
            verificationStatus: "unverified",
            fetchedAt: indicesResult.value.fetchedAt,
          });
        } else {
          facts.fieldFacts.push(failedOpenFact("marketIndices", "腾讯财经主要指数", indicesResult.reason));
        }
        if (sectorsResult.status === "fulfilled") {
          facts.fieldFacts.push({
            fieldKey: "sectorRankings",
            value: {
              total: sectorsResult.value.total,
              top: sectorsResult.value.top,
              bottom: sectorsResult.value.bottom,
            },
            status: "available",
            provider: "东方财富行业排名",
            sourceUrl: sectorsResult.value.sourceUrl,
            confidence: "high",
            verificationStatus: "unverified",
            fetchedAt: sectorsResult.value.fetchedAt,
          });
        } else {
          facts.fieldFacts.push(failedOpenFact("sectorRankings", "东方财富行业排名", sectorsResult.reason));
        }
        if (breadthResult.status === "fulfilled") {
          facts.fieldFacts.push({
            fieldKey: "marketBreadth",
            value: breadthResult.value.breadth,
            status: "available",
            provider: "东方财富全市场行情",
            sourceUrl: breadthResult.value.sourceUrl,
            confidence: "high",
            verificationStatus: "unverified",
            fetchedAt: breadthResult.value.fetchedAt,
          });
        } else {
          facts.fieldFacts.push(failedOpenFact("marketBreadth", "东方财富全市场行情", breadthResult.reason));
        }
        if (technicalResult.status === "fulfilled") {
          const technicalProviders = new Set(technicalResult.value.snapshots.map((snapshot) => snapshot.source));
          const technicalProvider = technicalProviders.size === 1 && technicalProviders.has("tencent_kline")
            ? "腾讯财经指数历史日线"
            : technicalProviders.size === 1
              ? "东方财富指数历史日线"
              : "东财与腾讯指数历史日线";
          facts.fieldFacts.push({
            fieldKey: "marketTechnicalSnapshots",
            value: technicalResult.value,
            status: "available",
            provider: technicalProvider,
            sourceUrl: technicalResult.value.snapshots[0]?.sourceUrl ?? "https://quote.eastmoney.com/center/",
            confidence: technicalResult.value.failures.length ? "medium" : "high",
            verificationStatus: "unverified",
            fetchedAt: technicalResult.value.fetchedAt,
          });
        } else {
          facts.fieldFacts.push(failedOpenFact("marketTechnicalSnapshots", "东方财富指数历史日线", technicalResult.reason));
        }
        if (directNewsResult.status === "fulfilled") {
          facts.fieldFacts.push({
            fieldKey: "marketNewsDirect",
            value: directNewsResult.value.news,
            status: "available",
            provider: "东方财富财经快讯",
            sourceUrl: directNewsResult.value.sourceUrl,
            confidence: "medium",
            verificationStatus: "unverified",
            fetchedAt: directNewsResult.value.fetchedAt,
          });
        } else {
          facts.fieldFacts.push(failedOpenFact("marketNewsDirect", "东方财富财经快讯", directNewsResult.reason));
        }
        if (newsResult.status === "fulfilled") facts.fieldFacts.push(...newsResult.value.fieldFacts);
        else if (directNewsResult.status !== "fulfilled") facts.fieldFacts.push(failedOpenFact("marketNews", "市场情报检索", newsResult.reason));
        const availableMarketFacts = facts.fieldFacts.filter((fact) => fact.status === "available").length;
        const failedMarketFacts = facts.fieldFacts.filter((fact) => fact.status === "failed").length;
        facts.dossierQuality = {
          overallScore: Math.min(90, availableMarketFacts * 12),
          reliabilityLabel: availableMarketFacts >= 3 ? "市场资料可交叉研判" : "市场资料待补充",
        };
        emit({
          type: "tool_done",
          step: 2,
          message: `已接入 ${availableMarketFacts} 组可引用资料${failedMarketFacts ? `，${failedMarketFacts} 组暂不可用` : ""}`,
          tool: "get_market_indices",
          displayName: "A股市场工具",
          success: availableMarketFacts > 0,
          durationMs: Date.now() - marketStartedAt,
        });
      }
      const externalSecurity = parseExternalSecurityContext(context.externalSecurity);
      if (externalSecurity) {
        facts.subject = {
          kind: "question",
          label: externalSecurity.label,
          key: `${externalSecurity.market}:${externalSecurity.symbol}`,
        };
        facts.company = {
          subjectType: "external_security",
          market: externalSecurity.market,
          symbol: externalSecurity.symbol,
          label: externalSecurity.label,
        };
        if (isDAStockDataSourceConfigured()) {
          const bridgeStartedAt = Date.now();
          emit({
            type: "tool_start",
            step: 2,
            message: `正在读取 ${externalSecurity.market.toUpperCase()} 行情与跨市场新闻资料`,
            tool: "da_stock_provider_bridge",
            displayName: "跨市场数据源",
          });
          try {
            const bridge = await fetchDAStockExternalResearchFacts(
              externalSecurity.symbol,
              externalSecurity.market,
              externalSecurity.label,
            );
            facts.fieldFacts.push(...bridge.fieldFacts);
            facts.dossierQuality = {
              overallScore: bridge.fieldFacts.filter((fact) => fact.status === "available").length > 0 ? 45 : 0,
              reliabilityLabel: bridge.successfulProviders.length > 0 ? "跨市场资料待交叉核验" : "暂无跨市场资料",
            };
            emit({
              type: "tool_done",
              step: 2,
              message: `跨市场资料读取完成：${bridge.successfulProviders.length} 个来源成功，${bridge.failedProviders.length} 个待重试`,
              tool: "da_stock_provider_bridge",
              displayName: "跨市场数据源",
              success: bridge.successfulProviders.length > 0,
              durationMs: Date.now() - bridgeStartedAt,
            });
          } catch (error) {
            emit({
              type: "tool_done",
              step: 2,
              message: `跨市场资料暂不可用：${publicProviderRefreshErrorMessage(error)}`,
              tool: "da_stock_provider_bridge",
              displayName: "跨市场数据源",
              success: false,
              durationMs: Date.now() - bridgeStartedAt,
            });
          }
        }
      }
    }
    if (!facts) {
      throw new ResearchRequestError(targetType === "industry" ? "产业分类不存在" : "公司不存在", 404);
    }

    const evidenceStartedAt = Date.now();
    emit({
      type: "tool_start",
      step: 2,
      message: "正在从统一公司档案装载字段级来源并建立引用目录",
      tool: "evidence_catalog",
      displayName: "证据目录装载",
    });
    const availableCitationCount = buildResearchEvidenceCatalog(facts).length;
    emit({
      type: "tool_done",
      step: 2,
      message: availableCitationCount > 0
        ? `已装载 ${availableCitationCount} 条可追溯资料，并完成来源、时效和可引用状态检查`
        : "当前档案没有通过来源与时效检查的可引用资料",
      tool: "evidence_catalog",
      displayName: "证据目录装载",
      success: availableCitationCount > 0,
      durationMs: Date.now() - evidenceStartedAt,
    });

    const resolvedSubjectKey = subjectKey || facts.subject?.key || (targetType === "industry" ? String(categoryId) : "question");
    const resolvedSubjectLabel = subjectLabel || facts.subject?.label || question.slice(0, 80);
    upsertResearchSession(db, {
      sessionId,
      title: existingConversation?.session.title || question.slice(0, 60) || resolvedSubjectLabel,
      targetType,
      subjectKey: resolvedSubjectKey,
      subjectLabel: resolvedSubjectLabel,
      stockCode,
      categoryId,
      depth,
      skills: skills.map((skill) => skill.id),
      context: { ...context, contextCompression },
    });
    addResearchMessage(db, {
      sessionId,
      role: "user",
      content: question,
      metadata: { depth, skills: skills.map((skill) => skill.id), contextCompressed: contextCompression },
    });
    failedConversation = { sessionId };
    const conversationHistory = buildResearchConversationContext(
      (existingConversation?.messages ?? []).map((message) => ({
        role: message.role,
        content: message.content,
      })),
      { compressionEnabled: contextCompression },
    );
    // Keep the user's wording intact. DA-Stock's chat contract sends the
    // original message to the Agent; rewriting every company mention into a
    // fixed six-part company report was the main source of off-topic answers.
    const agentQuestion = question;
    let result;
    try {
      result = await runDeepResearchTeam(facts, {
        question: contextualQuestion(agentQuestion, context),
        depth,
        skills: skills.map((skill) => skill.id),
        conversationHistory,
        onProgress: (event) => {
          const publicEvent = sanitizePublicFacingPayload(event);
          progressEvents.push(publicEvent);
          options.onProgress?.(publicEvent);
        },
      }, {}, (input, init) => fetch(input, {
        ...init,
        signal: combineAbortSignals(init?.signal, options.signal),
      }));
    } catch (error) {
      if (!isRecoverableModelFailure(error)) throw error;
      const reason = publicResearchErrorMessage(error);
      emit({
        type: "agent_done",
        step: 5,
        message: "模型服务暂不可用，已切换为可追溯证据摘要",
        stageId: "chief",
        displayName: "主审 Agent",
        success: false,
      });
      emit({ type: "generating", step: 6, message: "正在生成不含模型推断的证据摘要" });
      result = buildEvidenceFallbackResearchResult(facts, {
        depth,
        skills: skills.map((skill) => skill.id),
        question: agentQuestion,
        reason,
      });
    }
    result = sanitizePublicFacingPayload(result);
    addResearchMessage(db, {
      sessionId,
      role: "assistant",
      content: resultToMarkdown(result),
      metadata: { result, depth, skills: skills.map((skill) => skill.id), progressEvents },
    });

    if (targetType === "company") {
      const id = saveResearchRun(db, { stockCode, categoryId, question, depth, result });
      return {
        sessionId,
        run: {
          id,
          stockCode,
          categoryId,
          question,
          depth,
          status: "completed",
          model: result.model,
          result,
          error: "",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };
    }
    const id = saveUniversalResearchRun(db, {
      subjectType: targetType,
      subjectKey: resolvedSubjectKey,
      subjectLabel: resolvedSubjectLabel,
      categoryId,
      question,
      depth,
      result,
    });
    return {
      sessionId,
      run: {
        id,
        subjectType: targetType,
        subjectKey: resolvedSubjectKey,
        subjectLabel: resolvedSubjectLabel,
        categoryId,
        question,
        depth,
        status: "completed",
        model: result.model,
        result,
        error: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    const message = publicResearchErrorMessage(error);
    if (failedConversation) {
      const cancelled = error instanceof DOMException && error.name === "AbortError";
      addResearchMessage(getDatabase(), {
        sessionId: failedConversation.sessionId,
        role: "assistant",
        content: cancelled ? `[研究已停止] ${message}` : `[研究失败] ${message}`,
        metadata: { error: message, cancelled },
      });
    }
    if (error instanceof ResearchRequestError) throw error;
    throw new ResearchRequestError(message);
  }
}

export function shouldLoadCompanyTechnicalData(question: string, skillIds: string[] = []) {
  if (skillIds.length > 0) return true;
  return /(股价|走势|趋势|行情|涨跌|技术面|技术分析|均线|ma\d*|macd|rsi|k\s*线|量价|成交量|放量|缩量|支撑|压力|阻力|突破|回调|买点|卖点|止损|止盈|仓位)/i.test(question);
}

function publicResearchErrorMessage(error: unknown) {
  if (error instanceof ResearchRequestError) return sanitizePublicReportText(error.message);
  if (error instanceof DOMException && error.name === "AbortError") return "研究请求已取消";
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return "AI 模型响应超时，请稍后重试或减少启用的研究策略";
  }
  if (error instanceof TypeError && /fetch failed|network/i.test(error.message)) {
    return "AI 模型服务暂时无法连接，请稍后重试";
  }
  if (error instanceof Error) return sanitizePublicReportText(error.message);
  return "AI 研究失败，请稍后重试";
}

function publicDataSourceErrorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return "日线行情服务响应超时";
  }
  if (error instanceof TypeError && /fetch failed|network/i.test(error.message)) {
    return "日线行情服务暂时无法连接";
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return "技术数据同步失败";
}

function publicProviderRefreshErrorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return "公司资料数据源响应超时";
  }
  if (error instanceof TypeError && /fetch failed|network/i.test(error.message)) {
    return "公司资料数据源暂时无法连接";
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return "公司资料同步失败";
}

function failedOpenFact(fieldKey: string, provider: string, error: unknown) {
  return {
    fieldKey,
    status: "failed" as const,
    provider,
    sourceUrl: "",
    confidence: "low" as const,
    verificationStatus: "unverified" as const,
    fetchedAt: new Date().toISOString(),
    error: publicProviderRefreshErrorMessage(error),
  };
}

function contextualQuestion(question: string, context: Record<string, unknown>) {
  const contextText = typeof context.text === "string" ? context.text.trim() : "";
  return contextText ? `${question}\n\n用户补充上下文：${contextText}` : question;
}

function combineAbortSignals(primary: AbortSignal | null | undefined, secondary: AbortSignal | undefined) {
  const signals = [primary, secondary].filter((signal): signal is AbortSignal => Boolean(signal));
  if (signals.length < 2) return signals[0];
  return AbortSignal.any(signals);
}

function isRecoverableModelFailure(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") return false;
  if (error instanceof DOMException && error.name === "TimeoutError") return true;
  if (!(error instanceof Error)) return false;
  return /DeepSeek|API key|模型|结构化输出|fetch failed|network|响应超时|额度|余额|调用失败|terminated|socket hang up|ECONNRESET|EPIPE|other side closed/i.test(error.message);
}

function resultToMarkdown(result: Awaited<ReturnType<typeof runDeepResearchTeam>>) {
  if (result.answerMarkdown?.trim()) return result.answerMarkdown.trim();
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
      ...result.plan.tasks.map((task) => `- **${task.name}**：${task.mission}（${task.reason}）`),
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
      ...result.decisionDashboard.watchConditions.map((condition) => `- 观察条件：${condition}`),
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseExternalSecurityContext(value: unknown) {
  if (!isRecord(value)) return null;
  const market: "hk" | "us" | null = value.market === "hk" || value.market === "us" ? value.market : null;
  const symbol = typeof value.symbol === "string" ? value.symbol.trim().toUpperCase() : "";
  const label = typeof value.label === "string" ? value.label.trim() : "";
  if (!market || !/^[A-Z0-9.]{1,12}$/.test(symbol)) return null;
  return { market, symbol, label: label || `${market.toUpperCase()} ${symbol}` };
}
