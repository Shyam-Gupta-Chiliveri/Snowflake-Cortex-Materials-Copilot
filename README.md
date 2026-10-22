# Snowflake Cortex materials quality copilot

English questions over **4Cr13 / X46CrS13 axle heat treatment**: 385,000 HV10 and three-point bending tests, SEM ductile/brittle maps, and 8D nonconformances. Answers are grounded on Snowflake data products (or a local mirror) and gated by work instruction WI-HT-4CR13.

Same plant story as the SAP quality copilot — not a generic pharma demo.

## Problem

Quality engineering has the campaign data (Versions 3, 6, 11, 14; groups A–I; Friulpress / Freund) and a U-Net that labels SEM fracture surfaces as dimple or cleavage. What they do not have is a way to ask, in English, whether a route is releasable, why untempered bars snap, or which 8D is still open — without inventing numbers.

## Approach

1. **Snowflake pipeline** (`snowflake/sql/`): landing stage → typed dynamic tables → MART data products (`ROUTE_QUALITY`, factor effects, tempering slope, SEM by route, data-quality checks).
2. **Cortex in the warehouse**: `CLASSIFY_TEXT` / `SUMMARIZE` on NCRs, Cortex Search over procedures + 8D texts, `COMPLETE` to write the answer, Snowflake ML classification for a ductility band from process and chemistry only.
3. **Node agent**: rule router, WI-HT-4CR13 §5 gate in code, BM25 retriever for the local mirror, numeric critic. The model explains the gate; it never overrides it.
4. **React workbench**: dark navy + gold, modeled on the SAP BTP quality cockpit. Overview, Cortex chat, group comparison, SEM, anomalies, ServiceNow preview.

When Snowflake is disconnected the API serves `data/mirror/products.json` and **mocks Cortex** with the deterministic composer so the app runs locally now.

## Result

- **V14** (vacuum hardening, 230 °C) is the series candidate: mean ductility 39.3 %, HV10 614.53, 0 % below 23 % ductility.
- **V14-RT** matches V14; the extra temper does nothing.
- **V6-F** (240 °C / 1 h) meets the 30 % ductility limit with little margin (30.01 %).
- **V6-A / V6-B-FRIULPRESS** (as quenched) are hard and brittle — not releasable.
- Version 6 tempering raises ductility by **0.0916 points per °C** between 180 and 240 °C.

## Stack

| Layer | What |
| --- | --- |
| Warehouse | Snowflake (account `ovllhya-hp33530`), XSMALL warehouse, 25-credit monthly cap |
| Auth | RSA key-pair service users (`MATERIALS_LOADER_SVC`, `MATERIALS_APP_SVC`) — no passwords |
| AI | Cortex Search, Cortex COMPLETE, Cortex CLASSIFY_TEXT / SUMMARIZE, Snowflake ML |
| API | Node 20, Express, `snowflake-sdk` |
| UI | React 18 + Vite |
| Local | Mirror built with the same parse rules as the SQL (`scripts/lib/parse.mjs`) |

## Status (honest)

| Piece | Label | Notes |
| --- | --- | --- |
| Local workbench + API + tests | **Artifact** | Runs now on the committed mirror of 385k tests / 1999 SEM images |
| Snowflake SQL pipeline | **Artifact** | Ready to run after ACCOUNTADMIN setup |
| Cortex Search / COMPLETE / CLASSIFY | **Target** | Live after `snowflake:build`; trial regions may need `CORTEX_ENABLED_CROSS_REGION` |
| Snowflake ML classification | **Target** | Trained in-warehouse; skipped gracefully if the trial cannot run it |
| Snowflake ML forecast / anomaly detection | **Target** | Source CSVs have no time index; rule-based `MART.ANOMALIES` is the live product |
| ServiceNow | **Artifact** | Stub incident payload unless `SERVICENOW_*` is set |
| VM deploy | **Target** | Docker Compose is local-only; VM needs explicit approval |
| Related Streamlit apps | **Live** | Not merged: [Agentic](https://138.2.179.154.sslip.io), [SEM](https://sem.138.2.179.154.sslip.io), [RAG](https://rag.138.2.179.154.sslip.io), [SAP](https://quality.138.2.179.154.sslip.io) |

## Honest limits

- Release criteria in WI-HT-4CR13 §5 (30 % ductility, 600 HV10, &lt;5 % low-ductility share) are **demo limits**, not a standard.
- NCR texts are **illustrative**, written so Cortex and 8D have something to read.
- SEM U-Net scores come from the DSML project; this repo does not retrain the network.
- Cortex is **mocked** until the Snowsight setup and `npm run snowflake:build` have run.
- ServiceNow is a **stub** unless `SERVICENOW_*` is set.
- The 67 MB axle CSV is **not in git**. Load it from the local DSML path after you run the ACCOUNTADMIN SQL.
- Knowledge docs are original procedure summaries that name ISO 6507-1 / Vickers HV10; they do not copy standard text.

## Local run (no Snowflake)

```bash
npm start          # API on http://127.0.0.1:8080  (local mirror, Cortex mocked)
npm run web        # Vite on http://127.0.0.1:5173
npm test           # node:test, no live Snowflake
```

`GET /health` should report `"mode": "mirror"` and `"cortex": "mocked"`.

Docker:

```bash
docker compose up --build
# http://127.0.0.1:8080
```

Rebuild the local mirror after you have the raw CSVs:

```bash
npm run build-mirror
```

Default paths: `../DSML_Final_Project/data/axle_test_385000_samples.csv` and `../DSML_Final_Project/sem_output/all_predictions.csv`.

## Snowsight SQL (once, as ACCOUNTADMIN)

1. `npm run snowflake:keys` writes `keys/*_private.pem` (gitignored) and fills `snowflake/account_setup.sql`.
2. Paste **`snowflake/account_setup.sql`** into a Snowsight worksheet as **ACCOUNTADMIN** and run it. Reply **done** when it finishes.
3. Copy `.env.example` → `.env` (account is already `ovllhya-hp33530`).
4. `npm run snowflake:build` PUTs the CSVs and runs `snowflake/sql/01_raw.sql` … `08_app.sql`. Cortex / ML steps are skipped with a warning if the trial cannot run them.
5. `npm run snowflake:verify` then `npm start` — `/health` should switch to `"mode": "snowflake"`.

Never paste a private key into chat, git, or Snowsight. Only the public key goes into `RSA_PUBLIC_KEY`.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Mirror vs Snowflake, Cortex mocked or live |
| POST | `/ask` | Copilot (`{ "question": "Can we release V6-F?" }`) |
| GET | `/kpis` | Tests, recommended route, open NCRs |
| GET | `/groups` or `/lots` | Routes with the release gate |
| GET | `/anomalies` | Open NCRs and failing routes |
| GET | `/sem` | U-Net ductile / brittle by route |
| GET | `/pipeline` | Lineage of RAW → CURATED → MART → Cortex |
| POST | `/servicenow` | Incident stub (`{ "ncrId": "NCR-2026-012" }`) |
| GET | `/servicenow?ncr=` | Preview the same payload |
