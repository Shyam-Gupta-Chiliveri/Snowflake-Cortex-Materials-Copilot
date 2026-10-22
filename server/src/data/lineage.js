// The pipeline as built by snowflake/sql/*.sql. The API merges live metadata into it
// (row counts, refresh state) when connected to Snowflake.

export const LINEAGE = [
  { id: 'RAW.LANDING', layer: 'Ingest', type: 'Internal stage', from: [], what: 'CSV files uploaded with PUT (gzip)' },
  { id: 'RAW.AXLE_TESTS_RAW', layer: 'Raw', type: 'Table', from: ['RAW.LANDING'], what: 'COPY INTO, 385,000 axle tests as delivered' },
  { id: 'RAW.SEM_PREDICTIONS_RAW', layer: 'Raw', type: 'Table', from: ['RAW.LANDING'], what: 'U-Net ductile / brittle results for 1,999 SEM images' },
  { id: 'RAW.NCR_RAW', layer: 'Raw', type: 'Table', from: ['RAW.LANDING'], what: 'Nonconformance texts, change tracking on' },
  { id: 'RAW.DOCUMENTS_RAW', layer: 'Raw', type: 'Table', from: [], what: 'Procedures and guides (markdown)' },
  { id: 'CURATED.AXLE_TESTS', layer: 'Curated', type: 'Dynamic table', from: ['RAW.AXLE_TESTS_RAW'], what: 'Typed, route parsed from free text (REGEXP_SUBSTR)' },
  { id: 'CURATED.SEM_FRACTOGRAPHY', layer: 'Curated', type: 'Dynamic table', from: ['RAW.SEM_PREDICTIONS_RAW'], what: 'Images linked to routes by file name' },
  { id: 'RAW.NCR_STREAM', layer: 'Curated', type: 'Stream', from: ['RAW.NCR_RAW'], what: 'Captures new NCRs' },
  { id: 'CURATED.ENRICH_NCR', layer: 'Curated', type: 'Task', from: ['RAW.NCR_STREAM'], what: 'Cortex CLASSIFY_TEXT and SUMMARIZE, then MERGE' },
  { id: 'CURATED.NCR_ENRICHED', layer: 'Curated', type: 'Table', from: ['CURATED.ENRICH_NCR'], what: 'NCR with root-cause area, severity, summary' },
  { id: 'MART.ROUTE_QUALITY', layer: 'Data product', type: 'Dynamic table', from: ['CURATED.AXLE_TESTS'], what: 'Quality by heat-treatment route' },
  { id: 'MART.FACTOR_EFFECTS', layer: 'Data product', type: 'Dynamic table', from: ['CURATED.AXLE_TESTS'], what: 'Material, diameter, die-casting, samples' },
  { id: 'MART.DUCTILITY_DRIVERS', layer: 'Data product', type: 'Dynamic table', from: ['CURATED.AXLE_TESTS'], what: 'Correlation of each variable with ductility' },
  { id: 'MART.TEMPERING_RESPONSE', layer: 'Data product', type: 'Dynamic table', from: ['CURATED.AXLE_TESTS'], what: 'Ductility per °C of tempering (REGR_SLOPE)' },
  { id: 'MART.DATA_QUALITY', layer: 'Data product', type: 'Dynamic table', from: ['CURATED.AXLE_TESTS'], what: 'Rule checks on every record' },
  { id: 'MART.SEM_BY_ROUTE', layer: 'Data product', type: 'Dynamic table', from: ['CURATED.SEM_FRACTOGRAPHY'], what: 'SEM ductile area by route' },
  { id: 'MART.ANOMALIES', layer: 'Data product', type: 'Dynamic table', from: ['MART.ROUTE_QUALITY', 'MART.SEM_BY_ROUTE', 'CURATED.NCR_ENRICHED'], what: 'Release blocks, SEM/lab mismatches, open NCRs' },
  { id: 'APP.V_GROUPS', layer: 'App', type: 'View', from: ['MART.ROUTE_QUALITY'], what: 'Read model for /groups and /lots' },
  { id: 'SEARCH.DOC_CHUNKS', layer: 'AI', type: 'Table', from: ['RAW.DOCUMENTS_RAW', 'CURATED.NCR_ENRICHED'], what: 'SPLIT_TEXT_RECURSIVE_CHARACTER chunks, injection filter' },
  { id: 'SEARCH.MATERIALS_SEARCH', layer: 'AI', type: 'Cortex Search service', from: ['SEARCH.DOC_CHUNKS'], what: 'Hybrid vector and keyword retrieval' },
  { id: 'ML.DUCTILITY_CLASSIFIER', layer: 'AI', type: 'Snowflake ML classification', from: ['CURATED.AXLE_TESTS'], what: 'Ductility band from process and chemistry' },
  { id: 'Cortex COMPLETE', layer: 'AI', type: 'Cortex LLM function', from: ['SEARCH.MATERIALS_SEARCH', 'MART.ROUTE_QUALITY'], what: 'Writes the answer from retrieved facts' },
]
