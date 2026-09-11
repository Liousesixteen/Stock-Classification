import type Database from "better-sqlite3";

type CategorySeed = {
  name: string;
  aliases?: string[];
  description?: string;
  industry?: string;
  stocks?: StockSeed[];
  children?: CategorySeed[];
};

type StockSeed = {
  stockCode: string;
  shortName: string;
  fullName?: string;
  board: string;
  industry: string;
  region?: string;
  marketCapBand?: string;
  intro: string;
  mainBusiness: string;
  relationType?: "主营业务" | "重要相关" | "概念/少量布局" | "待验证";
  confidence?: "高" | "中" | "低";
  rationale: string;
};

const semiconductorTree: CategorySeed = {
  name: "半导体",
  industry: "半导体",
  children: [
    {
      name: "材料",
      industry: "半导体材料",
      children: [
        {
          name: "光刻材料",
          industry: "半导体材料",
          children: [
            {
              name: "光刻胶",
              industry: "半导体材料",
              children: [
                { name: "g/i 线光刻胶", industry: "半导体材料" },
                { name: "KrF 光刻胶", industry: "半导体材料" },
                {
                  name: "ArF 干法/浸没式光刻胶",
                  aliases: ["ArF光刻胶", "ArF 干法光刻胶", "ArF 浸没式光刻胶"],
                  description: "用于先进制程光刻环节的关键光刻胶材料。",
                  industry: "半导体材料",
                },
                { name: "EUV 光刻胶", industry: "半导体材料" },
              ],
            },
            { name: "显影液/剥离液", industry: "半导体材料" },
            { name: "抗反射涂层 BARC", industry: "半导体材料" },
            { name: "光掩膜版/掩膜基板", industry: "半导体材料" },
          ],
        },
        {
          name: "硅材料",
          industry: "半导体材料",
          children: [
            { name: "6/8/12 英寸硅晶圆片", industry: "半导体材料" },
            { name: "抛光片", industry: "半导体材料" },
            { name: "外延片", industry: "半导体材料" },
            { name: "SOI 硅片", industry: "半导体材料" },
          ],
        },
        {
          name: "湿电子化学品",
          industry: "半导体材料",
          children: [
            { name: "高纯酸/碱/溶剂", industry: "半导体材料" },
            { name: "清洗液", industry: "半导体材料" },
            { name: "刻蚀液", industry: "半导体材料" },
            { name: "电镀液", industry: "半导体材料" },
          ],
        },
        {
          name: "电子特气",
          industry: "半导体材料",
          children: [
            { name: "刻蚀气体", industry: "半导体材料" },
            { name: "沉积气体", industry: "半导体材料" },
            { name: "掺杂气体", industry: "半导体材料" },
            { name: "清洗/载气", industry: "半导体材料" },
          ],
        },
        {
          name: "CMP 材料",
          industry: "半导体材料",
          children: [
            { name: "CMP 抛光液", industry: "半导体材料" },
            { name: "CMP 抛光垫", industry: "半导体材料" },
            { name: "清洗液/调节器", industry: "半导体材料" },
          ],
        },
        {
          name: "靶材/前驱体",
          industry: "半导体材料",
          children: [
            { name: "溅射靶材", industry: "半导体材料" },
            { name: "ALD/CVD 前驱体", industry: "半导体材料" },
            { name: "MO 源", industry: "半导体材料" },
          ],
        },
        {
          name: "封装材料",
          industry: "半导体材料",
          children: [
            { name: "环氧塑封料 EMC", industry: "半导体材料" },
            { name: "基板/载板", industry: "半导体材料" },
            { name: "键合丝/焊球", industry: "半导体材料" },
            { name: "底填胶/导热材料", industry: "半导体材料" },
          ],
        },
      ],
    },
    {
      name: "设备",
      industry: "半导体设备",
      children: [
        { name: "光刻设备", industry: "半导体设备" },
        { name: "刻蚀设备", industry: "半导体设备" },
        { name: "薄膜沉积设备", industry: "半导体设备" },
        { name: "清洗设备", industry: "半导体设备" },
        { name: "离子注入设备", industry: "半导体设备" },
        { name: "量测/测试设备", industry: "半导体设备" },
      ],
    },
    { name: "EDA/IP", industry: "半导体" },
    { name: "设计", industry: "半导体" },
    { name: "制造", industry: "半导体" },
    { name: "封测", industry: "半导体" },
  ],
};

const themeBoards: CategorySeed[] = [
  {
    name: "创新药",
    aliases: ["创新药概念", "创新药板块", "BK1106"],
    description: "覆盖 A 股创新药研发、商业化、ADC/生物药及相关医药服务标的。",
    industry: "医药生物",
    stocks: [
      {
        stockCode: "688235",
        shortName: "百济神州",
        board: "科创板",
        industry: "化学制药",
        intro: "全球化创新药企业，围绕肿瘤、自身免疫等方向推进研发和商业化。",
        mainBusiness: "创新药研发、生产及商业化。",
        relationType: "主营业务",
        confidence: "高",
        rationale: "东方财富创新药 BK1106 成分，主营聚焦创新药研发和商业化。",
      },
      {
        stockCode: "600276",
        shortName: "恒瑞医药",
        board: "沪市主板",
        industry: "化学制药",
        intro: "国内创新药龙头之一，覆盖抗肿瘤、麻醉、造影剂等领域。",
        mainBusiness: "药品研发、生产和销售，持续推进创新药管线。",
        relationType: "主营业务",
        confidence: "高",
        rationale: "东方财富创新药 BK1106 成分，国内创新药代表公司。",
      },
      {
        stockCode: "688331",
        shortName: "荣昌生物",
        board: "科创板",
        industry: "生物制品",
        intro: "生物创新药企业，布局抗体偶联药物、融合蛋白和抗体药物。",
        mainBusiness: "生物创新药研发、生产和商业化。",
        relationType: "主营业务",
        confidence: "高",
        rationale: "东方财富创新药 BK1106 成分，创新生物药和 ADC 代表标的。",
      },
      {
        stockCode: "688506",
        shortName: "百利天恒",
        board: "科创板",
        industry: "生物制品",
        intro: "创新生物药公司，重点推进双抗 ADC 等肿瘤治疗管线。",
        mainBusiness: "创新生物药研发及产业化。",
        relationType: "主营业务",
        confidence: "高",
        rationale: "东方财富创新药 BK1106 成分，创新药研发属性突出。",
      },
      {
        stockCode: "688578",
        shortName: "艾力斯",
        board: "科创板",
        industry: "化学制药",
        intro: "专注肿瘤治疗领域的小分子创新药企业。",
        mainBusiness: "抗肿瘤创新药研发、生产和销售。",
        relationType: "主营业务",
        confidence: "高",
        rationale: "东方财富创新药 BK1106 成分，创新药商业化标的。",
      },
      {
        stockCode: "688428",
        shortName: "诺诚健华",
        board: "科创板",
        industry: "化学制药",
        intro: "聚焦肿瘤和自身免疫疾病的创新药企业。",
        mainBusiness: "创新药研发、生产和商业化。",
        relationType: "主营业务",
        confidence: "高",
        rationale: "东方财富创新药 BK1106 成分，具备创新药管线和商业化产品。",
      },
      {
        stockCode: "002653",
        shortName: "海思科",
        board: "深市主板",
        industry: "化学制药",
        intro: "医药企业，持续推进麻醉、肿瘤、自免等创新药布局。",
        mainBusiness: "药品研发、生产及销售。",
        relationType: "重要相关",
        confidence: "中",
        rationale: "东方财富创新药 BK1106 成分，创新药布局占公司研究重点。",
      },
      {
        stockCode: "002422",
        shortName: "科伦药业",
        board: "深市主板",
        industry: "化学制药",
        intro: "大型制药企业，创新药和输液、抗生素等业务并行发展。",
        mainBusiness: "药品研发、生产和销售。",
        relationType: "重要相关",
        confidence: "中",
        rationale: "东方财富创新药 BK1106 成分，创新药管线具备研究价值。",
      },
      {
        stockCode: "600196",
        shortName: "复星医药",
        board: "沪市主板",
        industry: "化学制药",
        intro: "综合医药集团，覆盖药品、医疗器械、医疗服务等方向。",
        mainBusiness: "医药制造、研发和医疗健康服务。",
        relationType: "重要相关",
        confidence: "中",
        rationale: "东方财富创新药 BK1106 成分，创新药为其重要布局方向之一。",
      },
      {
        stockCode: "300558",
        shortName: "贝达药业",
        board: "创业板",
        industry: "化学制药",
        intro: "以肿瘤精准治疗为核心的创新药企业。",
        mainBusiness: "创新药研发、生产和销售。",
        relationType: "主营业务",
        confidence: "高",
        rationale: "东方财富创新药 BK1106 成分，创新药主营属性明确。",
      },
      {
        stockCode: "688266",
        shortName: "泽璟制药-U",
        board: "科创板",
        industry: "化学制药",
        intro: "创新药研发企业，聚焦肿瘤、出血及血液疾病等领域。",
        mainBusiness: "创新药研发、生产和商业化。",
        relationType: "主营业务",
        confidence: "高",
        rationale: "东方财富创新药 BK1106 成分，创新药研发属性明确。",
      },
      {
        stockCode: "688321",
        shortName: "微芯生物",
        board: "科创板",
        industry: "化学制药",
        intro: "原创新药企业，围绕肿瘤、代谢疾病和自身免疫方向研发。",
        mainBusiness: "原创新药研发、生产和销售。",
        relationType: "主营业务",
        confidence: "高",
        rationale: "东方财富创新药 BK1106 成分，原创新药代表标的。",
      },
    ],
  },
  {
    name: "机器人",
    aliases: ["机器人概念", "人形机器人", "BK1090"],
    description: "覆盖工业机器人、人形机器人、运动控制、减速器、传感器和自动化部件。",
    industry: "机械设备",
    stocks: [
      {
        stockCode: "300124",
        shortName: "汇川技术",
        board: "创业板",
        industry: "自动化设备",
        intro: "工业自动化龙头，覆盖变频器、伺服、控制器等自动化核心部件。",
        mainBusiness: "工业自动化控制产品、新能源汽车电控等。",
        relationType: "重要相关",
        confidence: "高",
        rationale: "东方财富机器人 BK1090 成分，运动控制和伺服系统是机器人核心部件。",
      },
      {
        stockCode: "002050",
        shortName: "三花智控",
        board: "深市主板",
        industry: "家电零部件",
        intro: "热管理龙头，亦布局机器人机电执行器等方向。",
        mainBusiness: "制冷空调电器零部件、汽车热管理及机电执行器。",
        relationType: "重要相关",
        confidence: "中",
        rationale: "东方财富机器人 BK1090 成分，机器人执行器方向具备主题相关性。",
      },
      {
        stockCode: "688017",
        shortName: "绿的谐波",
        board: "科创板",
        industry: "通用设备",
        intro: "谐波减速器企业，产品用于工业机器人、服务机器人等场景。",
        mainBusiness: "精密传动装置、谐波减速器研发生产销售。",
        relationType: "主营业务",
        confidence: "高",
        rationale: "机器人减速器核心标的，东方财富机器人 BK1090 成分。",
      },
      {
        stockCode: "002472",
        shortName: "双环传动",
        board: "深市主板",
        industry: "汽车零部件",
        intro: "精密齿轮和传动部件企业，布局机器人减速器及传动系统。",
        mainBusiness: "齿轮传动产品、精密传动部件研发制造。",
        relationType: "重要相关",
        confidence: "高",
        rationale: "东方财富机器人 BK1090 成分，精密传动方向相关度高。",
      },
      {
        stockCode: "002747",
        shortName: "埃斯顿",
        board: "深市主板",
        industry: "自动化设备",
        intro: "工业机器人及智能制造系统企业。",
        mainBusiness: "工业机器人、自动化核心部件和智能制造系统。",
        relationType: "主营业务",
        confidence: "高",
        rationale: "工业机器人本体与自动化系统标的，东方财富机器人 BK1090 成分。",
      },
      {
        stockCode: "300024",
        shortName: "机器人",
        board: "创业板",
        industry: "自动化设备",
        intro: "以机器人与智能制造解决方案为核心的自动化企业。",
        mainBusiness: "工业机器人、移动机器人、智能制造装备和系统集成。",
        relationType: "主营业务",
        confidence: "高",
        rationale: "公司名称和主营均指向机器人，东方财富机器人 BK1090 成分。",
      },
      {
        stockCode: "002979",
        shortName: "雷赛智能",
        board: "深市主板",
        industry: "自动化设备",
        intro: "运动控制企业，产品包括步进、伺服、控制器等。",
        mainBusiness: "运动控制核心部件研发、生产和销售。",
        relationType: "重要相关",
        confidence: "高",
        rationale: "运动控制是机器人核心环节，东方财富机器人 BK1090 成分。",
      },
      {
        stockCode: "603662",
        shortName: "柯力传感",
        board: "沪市主板",
        industry: "仪器仪表",
        intro: "传感器企业，布局力学传感器和智能感知方向。",
        mainBusiness: "应变式传感器、仪表和工业物联网产品。",
        relationType: "重要相关",
        confidence: "中",
        rationale: "机器人感知环节相关标的，东方财富机器人 BK1090 成分。",
      },
      {
        stockCode: "688160",
        shortName: "步科股份",
        board: "科创板",
        industry: "自动化设备",
        intro: "工业自动化控制企业，产品包括人机界面、伺服系统等。",
        mainBusiness: "工业自动化控制设备研发、生产和销售。",
        relationType: "重要相关",
        confidence: "中",
        rationale: "运动控制和自动化部件与机器人产业链相关。",
      },
      {
        stockCode: "300607",
        shortName: "拓斯达",
        board: "创业板",
        industry: "自动化设备",
        intro: "提供工业机器人、注塑自动化和智能制造系统。",
        mainBusiness: "工业机器人及自动化应用系统。",
        relationType: "主营业务",
        confidence: "高",
        rationale: "工业机器人和智能制造系统标的，东方财富机器人 BK1090 成分。",
      },
      {
        stockCode: "688003",
        shortName: "天准科技",
        board: "科创板",
        industry: "自动化设备",
        intro: "机器视觉装备企业，服务工业检测和智能制造场景。",
        mainBusiness: "机器视觉装备、工业检测装备和智能制造系统。",
        relationType: "重要相关",
        confidence: "中",
        rationale: "机器视觉是机器人感知与检测的重要环节。",
      },
      {
        stockCode: "301029",
        shortName: "怡合达",
        board: "创业板",
        industry: "自动化设备",
        intro: "自动化零部件平台型企业，服务智能制造和机器人自动化场景。",
        mainBusiness: "自动化零部件研发、销售和供应链服务。",
        relationType: "重要相关",
        confidence: "中",
        rationale: "自动化零部件平台与机器人产业链相关。",
      },
    ],
  },
  {
    name: "商业航天",
    aliases: ["商业航天概念", "卫星互联网", "BK0963"],
    description: "覆盖卫星制造运营、航天电子、连接器、卫星应用和发射配套。",
    industry: "国防军工",
    stocks: [
      {
        stockCode: "601698",
        shortName: "中国卫通",
        board: "沪市主板",
        industry: "航天装备",
        intro: "卫星运营服务企业，提供卫星空间段运营和综合信息服务。",
        mainBusiness: "卫星通信广播运营及综合信息服务。",
        relationType: "主营业务",
        confidence: "高",
        rationale: "东方财富商业航天 BK0963 成分，卫星运营属性明确。",
      },
      {
        stockCode: "600118",
        shortName: "中国卫星",
        board: "沪市主板",
        industry: "航天装备",
        intro: "小卫星制造和卫星应用企业。",
        mainBusiness: "小卫星研制、卫星应用及相关技术服务。",
        relationType: "主营业务",
        confidence: "高",
        rationale: "东方财富商业航天 BK0963 成分，卫星制造和应用核心标的。",
      },
      {
        stockCode: "002025",
        shortName: "航天电器",
        board: "深市主板",
        industry: "军工电子",
        intro: "高端连接器和继电器供应商，服务航天航空等高可靠场景。",
        mainBusiness: "连接器、继电器、电机等高端电子元器件。",
        relationType: "重要相关",
        confidence: "高",
        rationale: "东方财富商业航天 BK0963 成分，航天电子元器件供应链标的。",
      },
      {
        stockCode: "002179",
        shortName: "中航光电",
        board: "深市主板",
        industry: "军工电子",
        intro: "连接器龙头，产品应用于航空、航天、防务和高端制造。",
        mainBusiness: "光电连接器、线缆组件及集成互连产品。",
        relationType: "重要相关",
        confidence: "高",
        rationale: "商业航天上游高可靠互连器件相关标的，东方财富 BK0963 成分。",
      },
      {
        stockCode: "688629",
        shortName: "华丰科技",
        board: "科创板",
        industry: "军工电子",
        intro: "高端连接器企业，面向防务、通信和工业等高可靠应用。",
        mainBusiness: "光电连接器及互连产品。",
        relationType: "重要相关",
        confidence: "中",
        rationale: "东方财富商业航天 BK0963 成分，航天电子配套方向相关。",
      },
      {
        stockCode: "688103",
        shortName: "国力电子",
        board: "科创板",
        industry: "其他电子",
        intro: "电子真空器件企业，产品服务航天航空、新能源等领域。",
        mainBusiness: "电子真空器件研发、生产和销售。",
        relationType: "重要相关",
        confidence: "中",
        rationale: "东方财富商业航天 BK0963 成分，航天配套元器件方向相关。",
      },
      {
        stockCode: "688418",
        shortName: "震有科技",
        board: "科创板",
        industry: "通信设备",
        intro: "通信系统设备企业，参与卫星通信和专网通信相关场景。",
        mainBusiness: "核心网、指挥调度、卫星通信及专网通信系统。",
        relationType: "重要相关",
        confidence: "中",
        rationale: "商业航天卫星通信应用方向相关，东方财富 BK0963 成分。",
      },
      {
        stockCode: "300053",
        shortName: "航宇微",
        board: "创业板",
        industry: "军工电子",
        intro: "宇航电子和卫星大数据企业，服务航天及卫星应用。",
        mainBusiness: "宇航电子、卫星大数据及人工智能业务。",
        relationType: "主营业务",
        confidence: "高",
        rationale: "商业航天卫星应用和宇航电子标的，东方财富 BK0963 成分。",
      },
      {
        stockCode: "300101",
        shortName: "振芯科技",
        board: "创业板",
        industry: "军工电子",
        intro: "北斗和集成电路相关企业，服务卫星导航和高可靠电子场景。",
        mainBusiness: "北斗卫星导航终端、集成电路和安防监控。",
        relationType: "重要相关",
        confidence: "中",
        rationale: "卫星导航应用方向相关，东方财富商业航天 BK0963 成分。",
      },
      {
        stockCode: "300455",
        shortName: "航天智装",
        board: "创业板",
        industry: "自动化设备",
        intro: "航天技术应用企业，覆盖智能装备、传感测控等方向。",
        mainBusiness: "智能装备、传感测控和航天应用相关产品。",
        relationType: "重要相关",
        confidence: "中",
        rationale: "航天装备应用方向相关，东方财富商业航天 BK0963 成分。",
      },
      {
        stockCode: "603267",
        shortName: "鸿远电子",
        board: "沪市主板",
        industry: "元件",
        intro: "高可靠电子元器件企业，产品应用于航空航天等领域。",
        mainBusiness: "多层瓷介电容器等电子元器件。",
        relationType: "重要相关",
        confidence: "中",
        rationale: "航天电子元器件供应链标的，东方财富商业航天 BK0963 成分。",
      },
      {
        stockCode: "603678",
        shortName: "火炬电子",
        board: "沪市主板",
        industry: "元件",
        intro: "陶瓷电容器和新材料企业，服务高可靠电子应用场景。",
        mainBusiness: "电子元器件、新材料研发生产销售。",
        relationType: "重要相关",
        confidence: "中",
        rationale: "航天电子配套元器件方向相关，东方财富商业航天 BK0963 成分。",
      },
    ],
  },
  {
    name: "证券",
    aliases: ["证券Ⅱ", "券商", "BK0473"],
    description: "覆盖综合券商、财富管理、投行业务和资本市场服务。",
    industry: "非银金融",
    stocks: [
      { stockCode: "600030", shortName: "中信证券", board: "沪市主板", industry: "证券Ⅱ", intro: "综合性证券公司，业务覆盖经纪、投行、资管、自营等。", mainBusiness: "证券经纪、投资银行、资产管理、证券投资等。", relationType: "主营业务", confidence: "高", rationale: "东方财富证券Ⅱ BK0473 成分，综合券商龙头。" },
      { stockCode: "601211", shortName: "国泰海通", board: "沪市主板", industry: "证券Ⅱ", intro: "大型综合证券公司，覆盖财富管理、机构与投行等业务。", mainBusiness: "证券及期货经纪、投资银行、资产管理、自营投资等。", relationType: "主营业务", confidence: "高", rationale: "东方财富证券Ⅱ BK0473 成分，综合券商代表。" },
      { stockCode: "300059", shortName: "东方财富", board: "创业板", industry: "证券Ⅱ", intro: "互联网金融服务平台，旗下东方财富证券承接证券业务。", mainBusiness: "证券服务、金融数据服务、基金销售和互联网金融服务。", relationType: "主营业务", confidence: "高", rationale: "东方财富证券Ⅱ BK0473 成分，互联网券商和财富管理代表。" },
      { stockCode: "601066", shortName: "中信建投", board: "沪市主板", industry: "证券Ⅱ", intro: "综合证券公司，投行业务和财富管理业务具备较高关注度。", mainBusiness: "投资银行、财富管理、交易及机构客户服务等。", relationType: "主营业务", confidence: "高", rationale: "东方财富证券Ⅱ BK0473 成分，券商板块代表标的。" },
      { stockCode: "601688", shortName: "华泰证券", board: "沪市主板", industry: "证券Ⅱ", intro: "综合证券集团，财富管理和机构业务能力突出。", mainBusiness: "财富管理、机构服务、投资管理和国际业务。", relationType: "主营业务", confidence: "高", rationale: "东方财富证券Ⅱ BK0473 成分，综合券商代表。" },
      { stockCode: "000776", shortName: "广发证券", board: "深市主板", industry: "证券Ⅱ", intro: "全国性综合证券公司。", mainBusiness: "证券经纪、投行、资产管理、自营投资等。", relationType: "主营业务", confidence: "高", rationale: "东方财富证券Ⅱ BK0473 成分，券商板块核心标的。" },
      { stockCode: "600999", shortName: "招商证券", board: "沪市主板", industry: "证券Ⅱ", intro: "招商局集团旗下综合证券公司。", mainBusiness: "证券经纪、投行、资产管理、证券投资等。", relationType: "主营业务", confidence: "高", rationale: "东方财富证券Ⅱ BK0473 成分，综合券商标的。" },
      { stockCode: "601995", shortName: "中金公司", board: "沪市主板", industry: "证券Ⅱ", intro: "投资银行和机构业务特色鲜明的综合金融服务机构。", mainBusiness: "投资银行、股票业务、固定收益、财富管理和投资管理。", relationType: "主营业务", confidence: "高", rationale: "东方财富证券Ⅱ BK0473 成分，投行和机构业务代表。" },
      { stockCode: "601881", shortName: "中国银河", board: "沪市主板", industry: "证券Ⅱ", intro: "大型综合证券公司，分支机构和经纪业务基础较广。", mainBusiness: "财富管理、投行、机构业务、投资交易等。", relationType: "主营业务", confidence: "高", rationale: "东方财富证券Ⅱ BK0473 成分，券商板块代表标的。" },
      { stockCode: "000166", shortName: "申万宏源", board: "深市主板", industry: "证券Ⅱ", intro: "综合性证券金融控股平台。", mainBusiness: "证券、期货、资产管理、投资和研究服务。", relationType: "主营业务", confidence: "高", rationale: "东方财富证券Ⅱ BK0473 成分，综合券商标的。" },
      { stockCode: "002736", shortName: "国信证券", board: "深市主板", industry: "证券Ⅱ", intro: "综合证券公司，财富管理和投行业务具备市场影响力。", mainBusiness: "证券经纪、投行、资产管理和自营投资。", relationType: "主营业务", confidence: "高", rationale: "东方财富证券Ⅱ BK0473 成分，券商板块代表。" },
      { stockCode: "600958", shortName: "东方证券", board: "沪市主板", industry: "证券Ⅱ", intro: "上海国资背景综合证券公司。", mainBusiness: "证券销售交易、投资管理、经纪和投行业务。", relationType: "主营业务", confidence: "高", rationale: "东方财富证券Ⅱ BK0473 成分，综合券商标的。" },
    ],
  },
];

export function seedSemiconductorData(db: Database.Database) {
  const insertCategory = db.prepare(`
    insert into categories (name, parent_id, level, sort_order, aliases, description, industry)
    values (@name, @parentId, @level, @sortOrder, @aliases, @description, @industry)
  `);

  const findRootCategory = db.prepare("select id from categories where name = ? and parent_id is null");
  const findChildCategory = db.prepare("select id from categories where name = ? and parent_id = ?");

  const insertCompany = db.prepare(`
    insert into companies (
      stock_code,
      short_name,
      full_name,
      board,
      industry,
      region,
      market_cap_band,
      intro,
      main_business
    )
    values (
      @stockCode,
      @shortName,
      @fullName,
      @board,
      @industry,
      @region,
      @marketCapBand,
      @intro,
      @mainBusiness
    )
    on conflict(stock_code) do nothing
  `);

  const insertRelation = db.prepare(`
    insert into company_category_relations (
      stock_code,
      category_id,
      relation_type,
      confidence,
      rationale,
      is_watchlist
    )
    values (
      @stockCode,
      @categoryId,
      @relationType,
      @confidence,
      @rationale,
      0
    )
    on conflict(stock_code, category_id) do nothing
  `);

  const ensureCategory = (node: CategorySeed, parentId: number | null, level: number, sortOrder: number) => {
    const values = {
      name: node.name,
      parentId,
      level,
      sortOrder,
      aliases: JSON.stringify(node.aliases ?? []),
      description: node.description ?? "",
      industry: node.industry ?? "",
    };

    const existing = (parentId === null
      ? findRootCategory.get(node.name)
      : findChildCategory.get(node.name, parentId)) as { id: number } | undefined;

    const id = existing?.id ?? Number(insertCategory.run(values).lastInsertRowid);

    node.stocks?.forEach((stock) => {
      insertCompany.run({
        stockCode: stock.stockCode,
        shortName: stock.shortName,
        fullName: stock.fullName ?? "",
        board: stock.board,
        industry: stock.industry,
        region: stock.region ?? "",
        marketCapBand: stock.marketCapBand ?? "",
        intro: stock.intro,
        mainBusiness: stock.mainBusiness,
      });
      insertRelation.run({
        stockCode: stock.stockCode,
        categoryId: id,
        relationType: stock.relationType ?? "重要相关",
        confidence: stock.confidence ?? "中",
        rationale: stock.rationale,
      });
    });

    node.children?.forEach((child, index) => ensureCategory(child, id, level + 1, index));
    return id;
  };

  const seed = db.transaction(() => {
    const semiconductorRootId = ensureCategory(semiconductorTree, null, 0, 0);
    const packagingCategory = findChildCategory.get("封测", semiconductorRootId) as { id: number } | undefined;
    const packagingPeers: StockSeed[] = [
      { stockCode: "600584", shortName: "长电科技", board: "沪市主板", industry: "半导体", region: "江苏", intro: "全球领先的集成电路成品制造与技术服务提供商。", mainBusiness: "芯片成品制造、先进封装与测试的一站式解决方案。", relationType: "主营业务", confidence: "高", rationale: "主营覆盖晶圆中测、封装、成品测试和先进封装技术平台。" },
      { stockCode: "002156", shortName: "通富微电", board: "深市主板", industry: "半导体", region: "江苏", intro: "集成电路封装测试企业，覆盖先进封装与规模化制造。", mainBusiness: "集成电路封装测试。", relationType: "主营业务", confidence: "高", rationale: "主营业务直接属于封装测试环节。" },
      { stockCode: "002185", shortName: "华天科技", board: "深市主板", industry: "半导体", region: "甘肃", intro: "国内集成电路封装测试企业，持续布局先进封装。", mainBusiness: "集成电路封装测试。", relationType: "主营业务", confidence: "高", rationale: "主营业务直接属于封装测试环节。" },
      { stockCode: "600667", shortName: "太极实业", board: "沪市主板", industry: "半导体", region: "江苏", intro: "业务涉及半导体后工序服务与工程技术服务。", mainBusiness: "半导体后工序服务、工程技术服务等。", relationType: "重要相关", confidence: "中", rationale: "半导体后工序业务与封测产业链相关。" },
      { stockCode: "688820", shortName: "盛合晶微", board: "科创板", industry: "半导体", region: "江苏", intro: "聚焦晶圆级先进封装与多芯片集成的封装测试企业。", mainBusiness: "晶圆级先进封装、测试与相关技术服务。", relationType: "主营业务", confidence: "高", rationale: "主营聚焦晶圆级先进封装与测试。" },
    ];
    if (packagingCategory) packagingPeers.forEach((stock) => {
      insertCompany.run({
        stockCode: stock.stockCode,
        shortName: stock.shortName,
        fullName: stock.fullName ?? "",
        board: stock.board,
        industry: stock.industry,
        region: stock.region ?? "",
        marketCapBand: stock.marketCapBand ?? "",
        intro: stock.intro,
        mainBusiness: stock.mainBusiness,
      });
      insertRelation.run({
        stockCode: stock.stockCode,
        categoryId: packagingCategory.id,
        relationType: stock.relationType ?? "重要相关",
        confidence: stock.confidence ?? "中",
        rationale: stock.rationale,
      });
    });
    themeBoards.forEach((theme, index) => ensureCategory(theme, null, 0, index + 1));
    insertCompany.run({
      stockCode: "300346",
      shortName: "南大光电",
      fullName: "江苏南大光电材料股份有限公司",
      board: "创业板",
      industry: "电子材料",
      region: "江苏",
      marketCapBand: "",
      intro: "国内先进电子材料平台型企业，产品覆盖光刻胶配套材料、电子特气和前驱体材料等领域。",
      mainBusiness: "从事先进前驱体材料、电子特气、光刻胶及配套材料等半导体电子材料的研发、生产和销售。",
    });
    seedChangdianKnowledgeGraph(db);
  });

  seed();
}

function seedChangdianKnowledgeGraph(db: Database.Database) {
  const companyExists = db.prepare("select 1 from companies where stock_code = '600584'").get();
  if (!companyExists) return;
  const relations = [
    { entityType: "客户/供应商", entityName: "晶圆与芯片输入", entitySummary: "封测服务接收客户晶圆或芯片，进入晶圆中测、封装与成品测试流程。", relationType: "供应/采购", direction: "inbound", strength: 84, title: "长电科技 2025 年半年度报告：一站式芯片成品制造", url: "https://www.jcetglobal.com/uploads/2025-08-20/50092556385059a0.pdf", excerpt: "公司提供从设计仿真、晶圆中测、封装到成品测试的一站式芯片成品制造解决方案。" },
    { entityType: "客户/供应商", entityName: "封装基板与互连材料", entitySummary: "封装基板、引线框、凸块与互连材料构成先进封装关键工艺输入。", relationType: "供应/采购", direction: "inbound", strength: 76, title: "长电科技圆片级与扇出封装技术说明", url: "https://www.jcetglobal.com/site/TechInfo_2", excerpt: "公司晶圆级封装平台覆盖凸块、再分布层、硅通孔等关键互连工艺。" },
    { entityType: "客户/供应商", entityName: "引线框 / 键合线 / 焊球", entitySummary: "支撑焊线、倒装和基板互连的关键封装材料输入。", relationType: "供应/采购", direction: "inbound", strength: 78, title: "长电科技焊线封装技术说明", url: "https://www.jcetglobal.com/site/wirebond-packaging", excerpt: "焊线封装支持引线框架、MIS 基板以及铝、金、银、铜等多类焊线。" },
    { entityType: "客户/供应商", entityName: "塑封料 / 底填胶 / 热管理材料", entitySummary: "用于芯片保护、应力控制、底部填充和封装散热的材料输入。", relationType: "供应/采购", direction: "inbound", strength: 74, title: "长电科技全链路热管理方案", url: "https://www.jcetglobal.com/site/detailscon/2058", excerpt: "公司提供从芯片到系统的全链路热管理方案，覆盖高算力、汽车和功率器件应用。" },
    { entityType: "客户/供应商", entityName: "封装与测试设备", entitySummary: "晶圆中测、封装组装、成品测试和可靠性验证所需设备体系。", relationType: "供应/采购", direction: "inbound", strength: 72, title: "长电科技 2025 年半年度报告：一站式芯片成品制造", url: "https://www.jcetglobal.com/uploads/2025-08-20/50092556385059a0.pdf", excerpt: "公司服务覆盖晶圆中测、芯片及器件封装、成品测试和产品认证。" },
    { entityType: "产品/技术", entityName: "XDFOI™ Chiplet", entitySummary: "覆盖 2D、2.5D、3D Chiplet 集成的高性能封装技术平台。", relationType: "核心产品", direction: "undirected", strength: 97, title: "长电科技：高算力时代高性能封装承载 IC 产业创新", url: "https://www.jcetglobal.com/site/detailscon/1857", excerpt: "XDFOI Chiplet 系列工艺覆盖 2D、2.5D、3D 集成技术并已实现稳定量产。" },
    { entityType: "产品/技术", entityName: "WLP / 2.5D / 3D / SiP", entitySummary: "晶圆级封装、2.5D/3D、系统级封装等先进封装技术组合。", relationType: "核心产品", direction: "undirected", strength: 95, title: "长电科技圆片级与扇出封装技术说明", url: "https://www.jcetglobal.com/site/TechInfo_2", excerpt: "公司提供扇入、扇出、TSV 以及用于 2.5D 和 3D 集成的技术平台。" },
    { entityType: "产品/技术", entityName: "设计仿真—晶圆中测—成品测试", entitySummary: "覆盖设计仿真、晶圆中测、封装、测试、认证及全球直运。", relationType: "技术关联", direction: "undirected", strength: 92, title: "长电科技 2025 年半年度报告：业务与技术", url: "https://www.jcetglobal.com/uploads/2025-08-20/50092556385059a0.pdf", excerpt: "公司向全球客户提供全方位、一站式芯片成品制造解决方案。" },
    { entityType: "产品/技术", entityName: "倒装芯片封装", entitySummary: "覆盖 FCBGA、fcCSP、fcLGA、fcPoP 等高密度互连封装。", relationType: "核心产品", direction: "undirected", strength: 93, title: "长电科技倒装封装技术", url: "https://www.jcetglobal.com/site/TechInfo/1317", excerpt: "倒装芯片互连具备高电气与热性能，产品组合覆盖大型单芯片到复杂先进 3D 封装。" },
    { entityType: "产品/技术", entityName: "焊线与传统封装先进化", entitySummary: "覆盖 QFN、DFN、QFP、WB-BGA、WB-LGA 等成熟量产方案。", relationType: "核心产品", direction: "undirected", strength: 88, title: "长电科技焊线封装技术说明", url: "https://www.jcetglobal.com/site/wirebond-packaging", excerpt: "焊线封装覆盖多种封装类型，并拥有成熟稳定的大规模量产经验。" },
    { entityType: "产品/技术", entityName: "微系统集成 / SiP", entitySummary: "通过协同设计和系统级封装实现多芯片、多器件高密度集成。", relationType: "核心产品", direction: "undirected", strength: 94, title: "长电科技 2025 年半年度报告：先进封装技术", url: "https://www.jcetglobal.com/uploads/2025-08-20/50092556385059a0.pdf", excerpt: "公司拥有微系统集成、晶圆级封装、2.5D/3D 封装和系统级封装等技术。" },
    { entityType: "产品/技术", entityName: "产品认证与全球直运", entitySummary: "从产品认证延伸至全球直运，形成端到端交付闭环。", relationType: "技术关联", direction: "undirected", strength: 85, title: "长电科技 2025 年半年度报告：一站式服务", url: "https://www.jcetglobal.com/uploads/2025-08-20/50092556385059a0.pdf", excerpt: "一站式解决方案涵盖产品认证以及全球直运等服务。" },
    { entityType: "客户/供应商", entityName: "AI 与高性能计算", entitySummary: "运算电子占 2025 年上半年收入 22.4%，覆盖 CPU、GPU、AI 加速器与高带宽存储。", relationType: "客户验证", direction: "outbound", strength: 94, title: "长电科技 XDFOI 高性能封装平台", url: "https://www.jcetglobal.com/site/detailscon/1857", excerpt: "平台应用场景覆盖 FPGA、CPU、GPU、AI 和 5G 网络芯片。" },
    { entityType: "客户/供应商", entityName: "汽车电子", entitySummary: "汽车电子占 2025 年上半年收入 9.3%，覆盖功率、控制、传感和智能化芯片。", relationType: "客户验证", direction: "outbound", strength: 91, title: "长电科技 2025 年半年度报告：汽车电子业务", url: "https://www.jcetglobal.com/uploads/2025-08-20/50092556385059a0.pdf", excerpt: "汽车电子业务延续增长，公司推进车规级先进封装解决方案。" },
    { entityType: "客户/供应商", entityName: "存储与网络通信", entitySummary: "通讯电子占 2025 年上半年收入 38.1%，并覆盖高密度存储、网络通信与数据中心。", relationType: "客户验证", direction: "outbound", strength: 87, title: "长电科技 2025 年半年度报告：应用领域", url: "https://www.jcetglobal.com/uploads/2025-08-20/50092556385059a0.pdf", excerpt: "公司技术广泛应用于高密度存储、网络通信等领域。" },
    { entityType: "客户/供应商", entityName: "智能终端 / 工业医疗", entitySummary: "消费电子占 21.6%，工业及医疗电子占 8.6%，覆盖智能终端与工业控制。", relationType: "客户验证", direction: "outbound", strength: 82, title: "长电科技 2025 年半年度报告：应用领域", url: "https://www.jcetglobal.com/uploads/2025-08-20/50092556385059a0.pdf", excerpt: "公司产品覆盖智能终端、工业及医疗电子等应用领域。" },
    { entityType: "客户/供应商", entityName: "功率与能源", entitySummary: "面向功率器件、能源转换、数据中心电源及新能源汽车热管理应用。", relationType: "客户验证", direction: "outbound", strength: 84, title: "长电科技全链路热管理方案", url: "https://www.jcetglobal.com/site/detailscon/2058", excerpt: "公司方案面向高算力服务器、汽车功率模块与微型化功率器件。" },
    { entityType: "项目/产能", entityName: "八大生产基地", entitySummary: "公司在中国、韩国和新加坡布局八大生产基地。", relationType: "项目进展", direction: "undirected", strength: 90, title: "长电科技 2025 年半年度报告：全球制造布局", url: "https://www.jcetglobal.com/uploads/2025-08-20/50092556385059a0.pdf", excerpt: "公司在中国、韩国和新加坡设有八大生产基地。" },
    { entityType: "项目/产能", entityName: "两大研发中心", entitySummary: "公司在中国和韩国布局两大研发中心，支撑先进封装研发。", relationType: "项目进展", direction: "undirected", strength: 89, title: "长电科技 2025 年半年度报告：研发体系", url: "https://www.jcetglobal.com/uploads/2025-08-20/50092556385059a0.pdf", excerpt: "公司在中国和韩国设有两大研发中心。" },
    { entityType: "项目/产能", entityName: "20+ 全球业务机构", entitySummary: "在全球设有 20 多个业务机构，提供贴近客户的技术合作与产业链支持。", relationType: "项目进展", direction: "undirected", strength: 86, title: "长电科技 2025 年半年度报告：全球业务网络", url: "https://www.jcetglobal.com/uploads/2025-08-20/50092556385059a0.pdf", excerpt: "公司在全球设有 20 多个业务机构，为客户提供技术合作与产业链支持。" },
  ] as const;
  const insertEntity = db.prepare(`
    insert into research_graph_entities (entity_type, name, summary)
    values (@entityType, @entityName, @entitySummary)
    on conflict(entity_type, name) do update set summary = excluded.summary
  `);
  const findEntity = db.prepare("select id from research_graph_entities where entity_type = ? and name = ?");
  const upsertRelation = db.prepare(`
    insert into company_graph_entity_relations (
      stock_code, entity_id, relation_type, confidence, rationale, direction, strength,
      observed_at, verification_status, verified_at, is_watchlist
    ) values ('600584', @entityId, @relationType, '高', @rationale, @direction, @strength,
      '2025-08-20', 'verified', '2026-08-22', 0)
    on conflict(stock_code, entity_id) do update set
      relation_type = excluded.relation_type,
      confidence = excluded.confidence,
      rationale = excluded.rationale,
      direction = excluded.direction,
      strength = excluded.strength,
      observed_at = excluded.observed_at,
      verification_status = excluded.verification_status,
      verified_at = excluded.verified_at
  `);
  const findRelation = db.prepare("select id from company_graph_entity_relations where stock_code = '600584' and entity_id = ?");
  const insertEvidence = db.prepare(`
    insert into company_graph_entity_evidences (
      entity_relation_id, source_type, title, source_date, url, excerpt, credibility,
      verification_status, verified_at
    ) select @relationId, '公告', @title, '2025-08-20', @url, @excerpt, '高', 'verified', '2026-08-22'
    where not exists (
      select 1 from company_graph_entity_evidences where entity_relation_id = @relationId and title = @title
    )
  `);
  for (const relation of relations) {
    insertEntity.run(relation);
    const entity = findEntity.get(relation.entityType, relation.entityName) as { id: number };
    upsertRelation.run({
      entityId: entity.id,
      relationType: relation.relationType,
      rationale: `${relation.entitySummary}（关系范围为产业链环节，不代表未披露的具体客户或供应商名单。）`,
      direction: relation.direction,
      strength: relation.strength,
    });
    const relationRow = findRelation.get(entity.id) as { id: number };
    insertEvidence.run({ relationId: relationRow.id, title: relation.title, url: relation.url, excerpt: relation.excerpt });
  }
}
