# Company Atlas Redesign — Design QA

## Scope

- Final navigation: 星图、AI问股、研报生成、资讯；任务中心与账户入口固定在右上角。
- Industry overview remains intentionally sparse. Company-specific knowledge is progressively disclosed only after a company is selected.
- Company focus uses five relationship layers: 上游输入、核心业务、下游应用、组织能力、同业关系。
- Evidence is kept in the inspector rather than rendered as dense graph nodes.
- Desktop side rails are compact and collapsible; narrow layouts preserve the graph and use a bottom inspector.

## Visual sources

- User reference: `codex-clipboard-3e829c08-a0b1-46d5-a86b-c3cbe45ff0e0.png`
- Final overview: `03-final-atlas-overview.png`
- Final account: `04-final-account.png`
- Same-input comparison: `05-reference-implementation-comparison.png`

## Tested states

- Atlas overview with no company selected.
- Search and enter 长电科技 company focus.
- Default company focus with only direct company/category relationships.
- Progressive expansion through 产业关系 → 核心业务.
- Left panel collapse and right inspector collapse.
- Narrow viewport with bottom inspector and retained graph viewport.
- AI问股 workspace.
- 研报生成 workspace.
- 资讯 filters and evidence cards.
- 账户 page and 任务中心 drawer.

## Findings

- P0: none.
- P1: none.
- P2: none.
- P3: the task drawer intentionally becomes nearly full width on narrow screens; the desktop orbit branch navigator is replaced by the inspector's relationship controls on narrow screens.

## Accessibility and interaction

- Navigation and primary actions use semantic buttons with visible active, hover, and focus states.
- Icon-only controls have accessible labels.
- Gold is reserved for selection and primary actions; teal, blue, and violet encode relationship families.
- Text contrast and minimum control sizes were checked in the final narrow viewport.
- Progressive disclosure prevents overlapping labels from becoming the only way to understand company relationships.

## Engineering verification

- TypeScript typecheck: passed.
- ESLint: passed.
- Vitest: 68 files passed, 2 skipped; 241 tests passed, 2 skipped.
- Local preview: `http://127.0.0.1:3001/`.

final result: passed
