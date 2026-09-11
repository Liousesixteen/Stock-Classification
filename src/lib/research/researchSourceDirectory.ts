export type ResearchSourceTierId = "T0" | "T1" | "T2" | "T3" | "T4" | "T5" | "T1-T2" | "T2-T3";

export type ResearchSourceTier = {
  id: ResearchSourceTierId;
  name: string;
  rating: string;
  definition: string;
  useCases: string;
  examples: string;
};

export type ResearchSourceType = {
  tier: ResearchSourceTierId;
  group: string;
  name: string;
  rating: string;
  description: string;
  examples: string;
  useCases: string;
};

export type ResearchSourceScenario = {
  name: string;
  primary: string;
  secondary: string;
  rule: string;
  guardrail: string;
};

// 补充自《全类型信息来源渠道分类汇总表.xlsx》。这些条目描述信源选择与
// 证据分级，不代表所有平台都已经接入运行时。
export const RESEARCH_SOURCE_TIERS: ResearchSourceTier[] = [
  { id: "T0", name: "法定权威信源", rating: "★★★★★", definition: "官方原始发布、具备法定效力且可完整溯源的一手信息", useCases: "政策、统计、合规、司法与知识产权核验", examples: "中国政府网、国家统计局、央行、证监会、交易所、国家知识产权局" },
  { id: "T1", name: "国家级权威媒体与学术信源", rating: "★★★★☆", definition: "具备专业编审、同行评审或权威机构背书的高可信信源", useCases: "事实佐证、政策解读、学术与技术趋势", examples: "新华社、人民网、知网、万方、Web of Science、PubMed" },
  { id: "T2", name: "垂直行业与省级主流媒体", rating: "★★★★", definition: "深耕细分行业或区域、具备专业内容能力的主流信源", useCases: "行业动态、区域政策、细分领域研究", examples: "省级党媒、36氪、虎嗅、东方财富、行业协会" },
  { id: "T3", name: "综合商业门户与资讯平台", rating: "★★★☆", definition: "覆盖广、传播快，以二次整合为主的综合资讯信源", useCases: "热点追踪、信息广度与传播验证", examples: "腾讯新闻、网易新闻、搜狐新闻、新浪新闻、今日头条" },
  { id: "T4", name: "自媒体内容矩阵", rating: "★★★", definition: "个人或机构运营、以观点与长尾内容为主的内容账号", useCases: "观点线索、经验参考与口碑观察", examples: "微信公众号、知乎、头条号、百家号、B站专栏" },
  { id: "T5", name: "短视频与社交平台", rating: "★★☆", definition: "以短内容和实时互动为核心、传播快但碎片化的社交信源", useCases: "舆情苗头、用户反馈和事件热度监测", examples: "微博、抖音、快手、小红书、视频号、B站" },
  { id: "T1-T2", name: "国际权威信源", rating: "★★★★☆", definition: "国际组织、权威媒体与学术平台发布的全球信息", useCases: "全球行业、国际政策、跨国经营与学术研究", examples: "联合国、世界银行、IMF、OECD、路透社、AP、BBC" },
  { id: "T2-T3", name: "商业数据与专业数据库", rating: "★★★★", definition: "专业机构采集整理的金融、企业、行业和研报数据库", useCases: "尽调、竞品、市场规模、估值与投资研究", examples: "Wind、同花顺 iFinD、企查查、天眼查、慧博、头豹、艾瑞" },
];

export const RESEARCH_SOURCE_TYPES: ResearchSourceType[] = [
  ["T0", "法定权威信源", "政务官方平台", "★★★★★", "政府与部委发布的政策、统计和公示信息", "中国政府网、统计局、央行、证监会、工信部", "政策解读、宏观数据、政府公示"],
  ["T0", "法定权威信源", "法律法规与标准", "★★★★★", "法律法规、国家标准与行业标准原文", "国家法律法规数据库、国家标准全文公开系统", "企业合规、法律风险、标准对标"],
  ["T0", "法定权威信源", "司法与知识产权公示", "★★★★★", "裁判文书、专利、商标和版权的一手公示", "中国裁判文书网、国家知识产权局、中国商标网", "法律尽调、专利与知识产权分析"],
  ["T1", "权威媒体与学术", "央级权威媒体", "★★★★☆", "具备严格采编与事实核查机制的中央媒体", "新华社、人民网、央视网、中国新闻网、中国日报网", "重大事实佐证、政策权威解读"],
  ["T1", "权威媒体与学术", "核心学术数据库", "★★★★☆", "经同行评审的论文、学位论文与科研成果", "知网、万方、维普、Web of Science、PubMed", "技术趋势、学术研究、行业深度洞察"],
  ["T1", "权威媒体与学术", "行业白皮书与官方百科", "★★★★☆", "协会与权威机构发布的白皮书和认证知识", "中国信通院、行业协会白皮书、官方认证百科", "行业趋势、市场规模、概念界定"],
  ["T2", "垂直与区域信源", "省级党媒与地方官媒", "★★★★", "区域官方媒体和城市融媒体的一手信息", "省级党媒、地市融媒体、地方政府新闻门户", "区域政策、本地市场与项目动态"],
  ["T2", "垂直与区域信源", "行业垂直媒体", "★★★★", "长期覆盖财经、科技、医疗、汽车等细分行业", "36氪、虎嗅、IT之家、东方财富、亿欧网", "细分行业动态与专业分析"],
  ["T2", "垂直与区域信源", "行业协会官方平台", "★★★★", "行业协会与产业联盟发布的数据、标准和信息", "通信标准化协会、汽车流通协会等", "行业标准、产业数据、政策联动"],
  ["T3", "商业门户", "综合商业门户", "★★★☆", "覆盖广、更新快的综合商业新闻门户", "腾讯新闻、网易新闻、搜狐新闻、凤凰新闻、新浪新闻", "热点跟踪与事实广度补充"],
  ["T3", "商业门户", "移动资讯聚合平台", "★★★☆", "基于算法分发的移动资讯聚合渠道", "今日头条、百度资讯、UC头条、一点资讯", "热点传播与线索发现"],
  ["T4", "自媒体矩阵", "微信公众号生态", "★★★", "个人、机构和企业运营的深度图文内容", "垂直公众号、行业 KOL、企业官方公众号", "行业观点、长尾内容与口碑观察"],
  ["T4", "自媒体矩阵", "多平台自媒体账号", "★★★", "跨平台运营的观点和经验内容矩阵", "头条号、百家号、搜狐号、知乎、B站专栏", "观点线索与经验参考"],
  ["T5", "社交与短视频", "短视频平台", "★★☆", "强传播、强视觉、圈层化的短内容平台", "抖音、快手、视频号、B站、小红书", "热点苗头、用户反馈与产品口碑"],
  ["T5", "社交与短视频", "社交互动平台", "★★☆", "实时互动和公共话题发酵平台", "微博、知乎、豆瓣小组", "舆情监测与观点线索"],
  ["T1-T2", "国际权威信源", "国际组织官方平台", "★★★★☆", "国际组织发布的全球数据、规则与报告", "联合国、世界银行、IMF、OECD、WHO", "全球宏观、国际政策与跨国比较"],
  ["T1-T2", "国际权威信源", "国际权威媒体", "★★★★☆", "具备全球采编能力的通讯社与财经媒体", "路透社、AP、法新社、BBC、金融时报", "国际事件与全球行业动态"],
  ["T1-T2", "国际权威信源", "国际学术与数据平台", "★★★★☆", "覆盖全球科研成果与开放数据的平台", "Google Scholar、PubMed、Web of Science", "国际学术与跨国技术趋势"],
  ["T2-T3", "专业数据库", "金融与商业数据平台", "★★★★", "结构化金融、企业和宏观数据平台", "Wind、同花顺 iFinD、企查查、天眼查", "尽调、财务、竞品与投资研究"],
  ["T2-T3", "专业数据库", "行业研报与咨询平台", "★★★★", "咨询机构和券商研究所发布的行业研究", "慧博、头豹、艾瑞、易观、券商研究所", "市场规模、竞争格局与估值判断"],
].map(([tier, group, name, rating, description, examples, useCases]) => ({
  tier: tier as ResearchSourceTierId, group, name, rating, description, examples, useCases,
}));

export const RESEARCH_SOURCE_SCENARIOS: ResearchSourceScenario[] = [
  { name: "宏观经济与行业政策", primary: "T0 法定权威信源", secondary: "T1 权威媒体与学术", rule: "先取政策原文与官方统计，再用权威解读补充影响路径。", guardrail: "自媒体和社交内容不得证明政策事实。" },
  { name: "企业尽调与竞品分析", primary: "T0 + T2-T3 专业数据库", secondary: "T2 垂直行业媒体", rule: "先核验工商、司法、专利和公告，再交叉专业数据库与行业报道。", guardrail: "核对数据口径，不采信未经验证的爆料。" },
  { name: "技术趋势与学术研究", primary: "T1 核心学术信源", secondary: "T1-T2 国际平台 + T2 行业协会", rule: "优先同行评审成果，再验证产业落地与标准演进。", guardrail: "非学术内容只能作为线索。" },
  { name: "热点事件与舆情", primary: "T1 权威媒体 + T3 商业门户", secondary: "T5 社交平台", rule: "先找官方通报与事实核查，社交平台仅监测传播与情绪。", guardrail: "社交爆料必须经权威信源交叉验证。" },
  { name: "细分行业与市场空间", primary: "T2 垂直媒体 + T2-T3 专业数据库", secondary: "T2 协会 + T1 学术", rule: "行业数据、协会口径、学术研究至少两类来源交叉。", guardrail: "主观观点和客观数据必须分开。" },
  { name: "区域市场与项目跟踪", primary: "T2 地方官媒", secondary: "T4 本地自媒体", rule: "以地方官方政策和项目公示为底稿，本地内容补充执行线索。", guardrail: "未经证实的本地信息不得进入结论。" },
  { name: "国际市场与全球业务", primary: "T1-T2 国际权威信源", secondary: "T1 国内权威媒体", rule: "优先国际组织、监管和全球媒体原文，再做国内视角交叉。", guardrail: "检查时效、地域口径与翻译偏差。" },
];

export function inferResearchSourceScenario(question: string) {
  if (/宏观|大盘|政策|利率|通胀|经济/.test(question)) return RESEARCH_SOURCE_SCENARIOS[0];
  if (/尽调|竞品|公司|企业|财务|估值/.test(question)) return RESEARCH_SOURCE_SCENARIOS[1];
  if (/技术|论文|学术|专利|研发/.test(question)) return RESEARCH_SOURCE_SCENARIOS[2];
  if (/热点|舆情|传闻|情绪|社交/.test(question)) return RESEARCH_SOURCE_SCENARIOS[3];
  if (/行业|市场空间|产业|赛道/.test(question)) return RESEARCH_SOURCE_SCENARIOS[4];
  if (/区域|地方|本地|项目/.test(question)) return RESEARCH_SOURCE_SCENARIOS[5];
  if (/海外|国际|全球|出口/.test(question)) return RESEARCH_SOURCE_SCENARIOS[6];
  return RESEARCH_SOURCE_SCENARIOS[1];
}
