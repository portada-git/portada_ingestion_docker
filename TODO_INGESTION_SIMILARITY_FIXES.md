# TODO: Ingestion, Similarity, and Frontend Consensus Fixes

## 1. Rename reviewed percentage field in ingestion zone

### Problem
The ingestion-zone data currently uses `review_entries` / "review entries" wording for the reviewed percentage in Delta Lake / Delta Layer related ingestion outputs.

The monitor expects the field/name to be `reviews` only. Keeping `entries` causes the monitor to read the data incorrectly.

### TODO
- Find where the reviewed percentage field is produced for the ingestion zone.
- Rename the field/label from `review_entries` / "review entries" to `reviews`.
- Verify the monitor reads the corrected value.
- Check whether any existing Delta/JSON/parquet output needs migration or compatibility handling.

### Acceptance criteria
- The ingestion-zone output exposes `reviews`.
- The monitor reads and displays the reviewed percentage correctly.
- No remaining ingestion-zone output uses `review entries` for this metric.

---

## 2. Reclassify `semantica` algorithm as lexical Token Jaccard

### Problem
The algorithm currently shown as `semantica` is not actually semantic. In `portada-s-index`, it uses token Jaccard, which is lexical.

This causes confusing frontend labels and incorrect algorithm classification/storage.

### TODO
- Locate the `semantica` algorithm implementation in `portada-s-index`.
- Rename/reclassify it as `token_jaccard`.
- Move it under lexical algorithm grouping/category.
- Update persisted algorithm names where results are stored.
- Update frontend display label from `semantica` to `Token Jaccard`.
- Check config files and `algorithm_per_entity` references.

### Acceptance criteria
- The algorithm is no longer presented as semantic.
- It appears as `Token Jaccard` in the frontend.
- Stored results use the corrected algorithm identity.
- Existing config references are updated or safely migrated.

---

## 3. Prevent similarity result overwrite when processing one entity

### Problem
When running similarity generation for one entity, for example `port`, and later running it for another entity, for example `ship_type`, the latest run overwrites previous stored results.

This is dangerous because a full multi-hour processing run can be partially erased by reprocessing a single entity.

### TODO
- Locate the Spark/Delta similarity result write path.
- Check whether writes use overwrite mode at dataset/table level instead of entity partition level.
- Change writes so only the processed entity is replaced/updated.
- Preserve previously processed entities when running a single entity.
- Verify frontend can show results from multiple independently processed entities.

### Acceptance criteria
- Running `port` and then `ship_type` keeps both entities available.
- Re-running only `port` updates only `port`.
- A single-entity run never deletes unrelated entity results.
- Frontend shows all currently available processed entities.

---

## 4. Fix frontend consensus vote total display

### Problem
The consensus vote table shows confusing totals such as `9 de 5`.

The left side is the number of algorithms that voted yes, but the right side appears to be the number of algorithms configured/available for the entity, not the actual number of algorithm scores being displayed/evaluated.

### TODO
- Locate the frontend consensus vote table.
- Identify how the numerator and denominator are computed.
- Change denominator to represent the total number of algorithms considered/displayed in that row.
- Ensure numerator is the number of algorithms that voted yes.
- Avoid mixing "allowed algorithms for entity" with "algorithms that produced scores".

### Acceptance criteria
- If 9 algorithms produced scores and 9 voted yes, the UI shows `9 de 9`.
- If 9 algorithms produced scores and 5 voted yes, the UI shows `5 de 9`.
- The denominator is not incorrectly capped by entity-configured allowed algorithms.

