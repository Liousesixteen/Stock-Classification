# Design QA — 原版平面星图 + 详细公司关系

- Date: 2026-08-19
- Prototype: `prototype/`
- Verified URL: `http://localhost:4173/`
- Browser: Codex in-app browser
- State: 默认选中“通富微电”；分别验证关系面板关闭、关系面板打开、任务中心打开

## Comparison target and normalization

- Source visual truth: `/Users/ccdemac/.codex/generated_images/01a005ac-fea5-78a0-b1a9-0a93f5d7d597/exec-ad6cd8de-fbc1-4557-a33b-7674fc926bd7.png`
- Supporting star-field asset supplied by the user: `/Users/ccdemac/.codex/generated_images/01a005ac-fea5-78a0-b1a9-0a93f5d7d597/exec-24a67906-74b6-4d2e-9238-9b35c07542df.png`
- Source pixels: 1487 × 1058 px; normalized with contain scaling and centered padding to 1440 × 1024 px
- Primary implementation screenshot: `prototype/implementation-star-map-v3-desktop.png`
- Primary implementation pixels / CSS viewport: 1440 × 1024 px at 1× capture density
- Final live-browser screenshot: `prototype/implementation-star-map-v3-browser-final.png`
- Final live-browser pixels / CSS viewport: 1280 × 720 px; browser screenshot normalized to CSS pixels, reported devicePixelRatio 2
- Detailed relationship screenshot: `prototype/implementation-star-map-v3-relations-final.png` at 1280 × 720 px
- Full-view comparison evidence: `prototype/star-map-comparison-v3.png`
- Graph-focused comparison evidence: `prototype/star-map-focus-comparison-v3.png`

## Findings

- No actionable P0/P1/P2 findings remain.
- The implementation intentionally adds named downstream company nodes and a slide-in relationship inspector. These are the requested functional expansion; they retain the source's planar center-company hierarchy, star-field atmosphere, restrained gold/teal/blue palette, and compact bottom inspector.
- P3 follow-up only: at compact desktop heights the relationship list scrolls after roughly two and a half cards so evidence/actions stay persistently visible. This is acceptable because the tab counts remain visible and every relationship is keyboard reachable.

## Required fidelity surfaces

- Fonts and typography: Passed. Chinese system fallbacks, compact research-workbench sizing, optical hierarchy, line height, wrapping, truncation, and weight differences are coherent with the source. The selected company and relationship counts retain the strongest emphasis.
- Spacing and layout rhythm: Passed. Top navigation, centered search, primary graph, legend, mini-map, three evidence callouts, and bottom inspector follow the source proportions. Added downstream branches extend vertically without colliding with persistent controls.
- Colors and visual tokens: Passed. Navy-black surfaces, warm gold focus/customer states, teal supply states, blue secondary nodes, muted borders, glow, and opacity map consistently to the source.
- Image quality and asset fidelity: Passed. The supplied raster star field is used directly and remains sharp at both verified viewports. Standard interface symbols use the Phosphor icon family; no visible source asset has been replaced with placeholder or handcrafted SVG art.
- Copy and content: Passed. Company names, A-share codes, industry roles, direct relationship counts, evidence counts, dates, and relationship-strength labels are coherent and realistic.
- Icons and affordances: Passed. Company nodes, tab controls, panel close, search clear, task drawer, AI问股, 研报生成, and related-company drill-in affordances are visible and consistent.
- States and interactions: Passed. Selected-node glow, panel open/closed states, upstream/downstream/peer tabs, search results, linked-company drill-in, task drawer, toast actions, graph pan/zoom, and mini-map are implemented.
- Responsiveness: Passed at 1440 × 1024 and 1280 × 720. At widths below 1150 px secondary callouts collapse and the bottom inspector simplifies without horizontal clipping.
- Accessibility: Passed for semantic buttons, accessible company labels, labeled search/close/task controls, keyboard-reachable relationship drill-ins, contrast, and readable active states.

## Primary interactions tested

- Click “通富微电 002156” to open the detailed company relationship panel.
- Switch to “下游 4”, then use “查看歌尔股份关系”; company context and relationship data update correctly.
- Search “北方华创”, select the exact search result, and verify its 2 upstream / 3 downstream / 2 peer relationships.
- Open the top-right task center and verify the unread count plus running/completed/action-required task states.
- AI问股 and 生成研报 actions carry the selected-company context and show success feedback.
- Browser console checked after the final build: zero errors and zero warnings.

## Comparison history

1. P1 — The previous implementation used a literal 3D spherical globe, conflicting with the user's corrected requirement to preserve the original flat star-map style.
   - Fix: replaced the globe with a planar React Flow star-domain graph grounded in the selected source visual, restoring the center company, orbital industry structure, source palette, legend, mini-map, evidence callouts, and low-profile inspector.
   - Post-fix evidence: `prototype/star-map-comparison-v3.png`.
2. P2 — The first flat-graph pass placed the top supplier nodes too close to the centered search field.
   - Fix: increased fit-view padding from 0.08 to 0.15 and rebalanced the graph's vertical fit.
   - Post-fix evidence: `prototype/star-map-focus-comparison-v3.png`.
3. P2 — Related-company cards initially relied on a non-semantic clickable article surface.
   - Fix: added explicit labeled drill-in buttons such as “查看歌尔股份关系”, preserving the compact card layout while making navigation keyboard and screen-reader reachable.
   - Post-fix evidence: `prototype/implementation-star-map-v3-relations-final.png` and the successful related-company interaction test.

## Build verification

- `npm run build`: passed
- `npm run test:sites`: passed (4/4)

final result: passed
