import type { GraphEntityRelationType, GraphRelationDirection } from "@/lib/domain/types";
import type { CompanyGraphBranch } from "./layout";

export type CompanyChainMember = {
  name: string;
  stockCode?: string;
  note?: string;
};

export type CompanyChainFact = {
  label: string;
  value: string;
};

export type CompanyChainHub = {
  id: string;
  title: string;
  subtitle: string;
  branch: CompanyGraphBranch;
  relationType: GraphEntityRelationType;
  direction: GraphRelationDirection;
  summary: string;
  facts: CompanyChainFact[];
  members: CompanyChainMember[];
};

export type CompanyChainProfile = {
  stockCode: string;
  companyName: string;
  position: string[];
  positionSummary: string;
  industryStatus: string;
  coreValue: string;
  sourceLabel: string;
  hubs: CompanyChainHub[];
};

const profiles: Record<string, CompanyChainProfile> = {
  "600183": {
    stockCode: "600183",
    companyName: "生益科技",
    position: ["电子材料中游", "PCB 上游核心基材", "AI 高速板材"],
    positionSummary: "覆铜板（CCL）龙头、PCB 上游核心基材供应商，并通过生益电子向 PCB 成品环节垂直延伸。",
    industryStatus: "全球刚性覆铜板 TOP2、内资 CCL 龙头；表格记录其为大陆具备英伟达 M9 认证量产能力的供应商。",
    coreValue: "为 PCB 提供核心基材，并向 AI 服务器、通信、汽车电子及工控终端传导。",
    sourceLabel: "用户提供的《生益科技产业链及业务全梳理.xlsx》",
    hubs: [
      {
        id: "upstream-materials",
        title: "上游核心原材料",
        subtitle: "电子布 · 环氧树脂 · 电解铜箔",
        branch: "upstream",
        relationType: "供应/采购",
        direction: "inbound",
        summary: "上游由电子玻纤布、环氧树脂和电解铜箔构成；高速材料需要更高等级的石英布与高频树脂。",
        facts: [
          { label: "电子玻纤布", value: "中国巨石、宏和科技、泰山玻纤；长期长协并联合开发高速基材原料" },
          { label: "环氧树脂", value: "宏昌电子、圣泉集团、东材科技；普通环氧主供，高端树脂战略合作" },
          { label: "电解铜箔", value: "诺德股份、嘉元科技、江铜铜箔；大宗采购，价格波动影响成本" },
        ],
        members: [
          { name: "中国巨石", stockCode: "600176", note: "电子玻纤布" },
          { name: "宏和科技", stockCode: "603256", note: "电子玻纤布" },
          { name: "中材科技", stockCode: "002080", note: "泰山玻纤 / 电子布" },
          { name: "宏昌电子", stockCode: "603002", note: "环氧树脂" },
          { name: "圣泉集团", stockCode: "605589", note: "高端高频树脂" },
          { name: "东材科技", stockCode: "601208", note: "环氧树脂" },
          { name: "诺德股份", stockCode: "600110", note: "电解铜箔" },
          { name: "嘉元科技", stockCode: "688388", note: "电解铜箔" },
          { name: "江铜铜箔", note: "电解铜箔" },
        ],
      },
      {
        id: "core-business",
        title: "核心业务组合",
        subtitle: "CCL / PP · PCB · 前沿材料",
        branch: "core",
        relationType: "核心产品",
        direction: "undirected",
        summary: "主营业务以覆铜板 CCL 和半固化片 PP 为核心，同时覆盖 PCB 业务及封装基板、毫米波雷达材料等前沿方向。",
        facts: [
          { label: "覆铜板 CCL + PP", value: "约 63%；FR-4、M7/M8/M9 高频高速板、金属基板；普通板毛利率 15–20%，M9 约 45%" },
          { label: "PCB 业务", value: "约 32%；高速 PCB、HDI、封装基板；整体毛利率约 25–30%" },
          { label: "前沿新业务", value: "不足 5%；封装基板基材、汽车毫米波雷达高频板材，处于放量早期" },
          { label: "核心应用", value: "AI 服务器、交换机、5G 通信、汽车电子、工控、消费电子" },
        ],
        members: [],
      },
      {
        id: "vertical-pcb",
        title: "PCB 垂直协同",
        subtitle: "材料 → PCB 成品",
        branch: "core",
        relationType: "技术关联",
        direction: "bidirectional",
        summary: "子公司生益电子承接高速 PCB、HDI 与封装基板业务，形成 CCL—PCB 垂直协同。",
        facts: [
          { label: "协同路径", value: "生益科技提供 CCL / PP → 生益电子加工 PCB → 对接终端品牌" },
          { label: "战略价值", value: "形成材料—成品一体化服务，提高供应链响应效率并降低内部协同成本" },
        ],
        members: [{ name: "生益电子", stockCode: "688183", note: "控股子公司 / PCB 业务" }],
      },
      {
        id: "direct-customers",
        title: "下游直接客户",
        subtitle: "PCB 制造商",
        branch: "downstream",
        relationType: "客户验证",
        direction: "outbound",
        summary: "公司向内资与台资 PCB 头部企业供应覆铜板及高频高速板材，并向生益电子内部供货。",
        facts: [
          { label: "内资 PCB 客户", value: "沪电股份、深南电路、胜宏科技、景旺电子、鹏鼎控股" },
          { label: "台资 PCB 客户", value: "健鼎科技、欣兴电子、瀚宇博德、臻鼎科技" },
          { label: "内部客户", value: "生益电子；CCL—PCB 垂直一体化" },
        ],
        members: [
          { name: "沪电股份", stockCode: "002463", note: "高频高速板材客户" },
          { name: "深南电路", stockCode: "002916", note: "高频高速板材客户" },
          { name: "胜宏科技", stockCode: "300476", note: "高频高速板材客户" },
          { name: "景旺电子", stockCode: "603228", note: "PCB 客户" },
          { name: "鹏鼎控股", stockCode: "002938", note: "PCB 客户" },
          { name: "健鼎科技", note: "台资 PCB 客户" },
          { name: "欣兴电子", note: "台资 PCB 客户" },
          { name: "瀚宇博德", note: "台资 PCB 客户" },
          { name: "臻鼎科技", note: "台资 PCB 客户" },
          { name: "生益电子", stockCode: "688183", note: "内部协同" },
        ],
      },
      {
        id: "terminal-demand",
        title: "终端需求传导",
        subtitle: "AI 算力 · 汽车 · 通信",
        branch: "downstream",
        relationType: "客户验证",
        direction: "outbound",
        summary: "材料经 PCB 厂商加工后进入 AI 算力、国产算力、汽车电子与通信工控终端。",
        facts: [
          { label: "AI 算力", value: "英伟达、浪潮、戴尔、谷歌云、AMD；高速 CCL → PCB → 服务器" },
          { label: "国内算力", value: "华为昇腾、中兴通讯、寒武纪；高速 CCL → PCB → 算力设备" },
          { label: "汽车电子", value: "特斯拉、比亚迪、博世；车规板材 → PCB → 汽车电子 / 毫米波雷达" },
          { label: "通信与工控", value: "联想、新华三及服务器整机厂；FR-4 / 高速板材 → PCB → 通信工控设备" },
        ],
        members: [
          { name: "英伟达", note: "AI 算力终端" },
          { name: "AMD", note: "AI 算力终端" },
          { name: "华为昇腾", note: "国产算力终端" },
          { name: "中兴通讯", stockCode: "000063", note: "通信 / 算力终端" },
          { name: "寒武纪", stockCode: "688256", note: "国产算力终端" },
          { name: "特斯拉", note: "汽车电子终端" },
          { name: "比亚迪", stockCode: "002594", note: "汽车电子终端" },
          { name: "联想", note: "通信 / 工控终端" },
        ],
      },
      {
        id: "competition",
        title: "核心竞争格局",
        subtitle: "全球高端 · 内资同行",
        branch: "peer",
        relationType: "竞争关系",
        direction: "bidirectional",
        summary: "高端 CCL 面对台光电子、联茂电子、松下和罗杰斯，国内市场与南亚新材、华正新材、金安国纪竞争。",
        facts: [
          { label: "全球高端", value: "台光电子、联茂电子、松下、罗杰斯；高频高速材料与认证能力领先" },
          { label: "内资同行", value: "南亚新材、华正新材、金安国纪；争夺国内 PCB 客户订单" },
          { label: "垂直整合对手", value: "沪电股份、深南电路；既是下游客户，也存在少量材料端竞争" },
        ],
        members: [
          { name: "台光电子", note: "全球高端 CCL" },
          { name: "联茂电子", note: "全球高端 CCL" },
          { name: "松下", note: "海外高端材料" },
          { name: "罗杰斯", note: "海外高端材料" },
          { name: "南亚新材", stockCode: "688519", note: "内资 CCL 同行" },
          { name: "华正新材", stockCode: "603186", note: "内资 CCL 同行" },
          { name: "金安国纪", stockCode: "002636", note: "内资 CCL 同行" },
          { name: "沪电股份", stockCode: "002463", note: "客户 / 少量材料竞争" },
          { name: "深南电路", stockCode: "002916", note: "客户 / 少量材料竞争" },
        ],
      },
    ],
  },
};

export function getCompanyChainProfile(stockCode: string | null | undefined) {
  return stockCode ? profiles[stockCode] ?? null : null;
}

