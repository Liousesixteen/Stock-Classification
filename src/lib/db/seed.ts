import type Database from "better-sqlite3";

type CategorySeed = {
  name: string;
  aliases?: string[];
  description?: string;
  industry?: string;
  children?: CategorySeed[];
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

export function seedSemiconductorData(db: Database.Database) {
  const insertCategory = db.prepare(`
    insert into categories (name, parent_id, level, sort_order, aliases, description, industry)
    values (@name, @parentId, @level, @sortOrder, @aliases, @description, @industry)
  `);

  const updateCategory = db.prepare(`
    update categories
    set level = @level,
        sort_order = @sortOrder,
        aliases = @aliases,
        description = @description,
        industry = @industry,
        updated_at = current_timestamp
    where id = @id
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
      @intro,
      @mainBusiness
    )
    on conflict(stock_code) do update set
      short_name = excluded.short_name,
      full_name = excluded.full_name,
      board = excluded.board,
      industry = excluded.industry,
      region = excluded.region,
      intro = excluded.intro,
      main_business = excluded.main_business,
      updated_at = current_timestamp
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
    if (existing) {
      updateCategory.run({ ...values, id });
    }

    node.children?.forEach((child, index) => ensureCategory(child, id, level + 1, index));
  };

  const seed = db.transaction(() => {
    ensureCategory(semiconductorTree, null, 0, 0);
    insertCompany.run({
      stockCode: "300346",
      shortName: "南大光电",
      fullName: "江苏南大光电材料股份有限公司",
      board: "创业板",
      industry: "电子材料",
      region: "江苏",
      intro: "国内先进电子材料平台型企业，产品覆盖光刻胶配套材料、电子特气和前驱体材料等领域。",
      mainBusiness: "从事先进前驱体材料、电子特气、光刻胶及配套材料等半导体电子材料的研发、生产和销售。",
    });
  });

  seed();
}
