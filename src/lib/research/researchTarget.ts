export type MarketResearchTarget = {
  market: "cn";
  key: "market-cn";
  label: "A股大盘";
};

const MARKET_QUERY_PATTERN = /(?:大盘|盘面|A股(?:市场)?|沪深(?:两市|市场)|上证(?:指数|综指)?|深证成指|创业板指|科创50|沪深300|中证500|中证1000|市场(?:走势|行情|趋势|情绪|风格|复盘)|指数(?:走势|行情|趋势|复盘)|涨跌家数|板块轮动)/i;

export function inferMarketResearchTarget(value: string): MarketResearchTarget | null {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized || !MARKET_QUERY_PATTERN.test(normalized)) return null;
  if (/(?:个股|公司|股票)(?:的|对|与)/.test(normalized)) return null;
  // A market term can be supporting context for an explicitly named security.
  // Keep these questions on the company route so the market evidence is used to
  // explain the company instead of replacing it as the research subject.
  if (/(?:大盘|盘面|A股(?:市场)?|指数).{0,12}(?:对|如何影响)[\u4e00-\u9fa5A-Za-z0-9]{2,16}/i.test(normalized)) return null;
  if (/[\u4e00-\u9fa5A-Za-z0-9]{2,16}.{0,4}(?:受|与)(?:大盘|盘面|A股(?:市场)?|指数)/i.test(normalized)) return null;
  return { market: "cn", key: "market-cn", label: "A股大盘" };
}

export function inferStandaloneStockQuery(value: string) {
  const normalized = value.trim().replace(/[，。！？,.!?]+$/g, "");
  if (inferMarketResearchTarget(normalized)) return "";
  const codeMatch = normalized.match(/(?:^|\D)((?:00|30|60|68|83|87|92)\d{4})(?:\D|$)/);
  if (codeMatch?.[1]) return codeMatch[1];
  const topicDirectedMatch = normalized.match(
    /^(?:请)?(?:分析(?:一下)?|研究(?:一下)?|看看|看下|查询)([\u4e00-\u9fa5A-Za-z]{2,12}?)(?:股票|公司)?(?:的)?(?:趋势|风险|价值|估值|业务|财务|催化|技术面|基本面)(?:怎么样|如何)?$/,
  );
  if (topicDirectedMatch?.[1]) return topicDirectedMatch[1];
  const directedMatch = normalized.match(
    /^(?:请)?(?:分析(?:一下)?|研究(?:一下)?|看看|看下|查询)([\u4e00-\u9fa5A-Za-z]{2,12})(?:股票|公司)?(?:怎么样|如何)?$/,
  );
  if (directedMatch?.[1]) return directedMatch[1];
  const casualMatch = normalized.match(
    /^([\u4e00-\u9fa5A-Za-z]{2,8})(?:股票|公司)?(?:怎么样|值得研究吗)$/,
  );
  if (casualMatch?.[1]) return casualMatch[1];
  if (/(?:的|什么|如何|为何|是否|怎么|风险|价值|催化|产业|行业|业务|财务|估值)/.test(normalized)) {
    return "";
  }

  const nameMatch = normalized.match(/^([\u4e00-\u9fa5A-Za-z]{2,12})(?:股票|公司)?$/);
  return nameMatch?.[1] ?? "";
}
