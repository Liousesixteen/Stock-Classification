# Upstream migration record

- Source working tree: `/Users/ccdemac/DevProjs/Paper-Experiment/FinSight`
- Repository: `https://github.com/RUC-NLPIR/FinSight.git`
- Base commit at migration: `8fc5bce28ac201c713219a47d30367c6a84342f4`
- Migration date: `2026-08-22`
- License: GPL-3.0; see `LICENSE` in this directory.

The migrated snapshot intentionally includes the source working tree's local core fixes in addition to the base commit.
All non-frontend core source, prompts, templates, fonts, backend code, configs, scripts, tests, and documentation were copied.
Excluded: `demo/frontend`, `.env`, VCS metadata, virtual environments, caches, browser runtimes, generated outputs,
promotional videos, and example finished reports. The `integration/` directory is the host application's adapter and is
not part of upstream FinSight.

Host hardening after the byte-for-byte copy is intentionally limited to: exporting the already-present legacy
`CodeExecutor` from `src.utils`, gating the upstream VLM smoke script behind `RUN_LIVE_FINSIGHT_TESTS=1`, and adding
the report-workshop adapter/tests. Yahoo/FRED-dependent acceptance tests are likewise marked live-only so an offline
suite does not fail on DNS or provider availability. Placeholder API keys in `.env.example` were emptied so the host
secret scanner remains strict. The upstream Pandoc launcher is preserved and `pypandoc_binary` is declared so a fresh
service virtualenv can render DOCX without relying on a global Pandoc install. These changes do not remove or replace
any pipeline capability.
