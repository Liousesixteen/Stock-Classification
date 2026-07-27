export const RELATION_TYPES = ["主营业务", "重要相关", "概念/少量布局", "待验证"] as const;
export const CONFIDENCE_LEVELS = ["高", "中", "低"] as const;
export const SOURCE_TYPES = ["年报", "公告", "互动易", "研报", "网页", "手动备注", "其他"] as const;
export const NOTE_TYPES = ["研究备注", "催化因素", "风险点", "争议点", "待验证问题", "收入占比", "客户", "产能/项目进度"] as const;
export const GRAPH_ENTITY_TYPES = ["产品/技术", "客户/供应商", "项目/产能", "事件/政策"] as const;
export const GRAPH_ENTITY_RELATION_TYPES = ["核心产品", "技术关联", "供应/采购", "客户验证", "项目进展", "政策催化", "风险传导", "竞争关系"] as const;
export const GRAPH_RELATION_DIRECTIONS = ["undirected", "inbound", "outbound", "bidirectional"] as const;
