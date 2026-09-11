# A-share universe star-map QA

## Scope

- Complete active A-share company universe and SW 2021 L1/L2/L3 taxonomy.
- Progressive star-map disclosure from global taxonomy to leaf industries and companies.
- Direct company lookup from the global search field.

## Browser verification

- Local preview: `http://127.0.0.1:3001/`
- Global view renders category galaxies without the former 5,522-company white cluster.
- Search `水泥制造` returns the L3 node and opens its 21-company local system.
- Search `长电科技` returns stock code `600584` and opens the company knowledge graph.
- No browser console errors or warnings were observed in the verified states.

## Data verification

- Active A-share companies: 5,522
- SW 2021 taxonomy: 1 root, 31 L1, 134 L2, 346 L3
- SW company-to-L3 memberships: 5,522
- Mapping coverage: 100%

## Automated checks

- TypeScript typecheck: passed
- ESLint: passed
- Targeted Vitest suite: 15 tests passed

final result: passed
