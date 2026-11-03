-- Custom SQL migration file, put your code below! --
-- M11.3 data repair (owner bug 2026-11-03; BR-90 "option names are unique per column, trimmed, case-insensitive").
-- Before the fix, quick successive "สร้าง …" in a SELECT / MULTI_SELECT cell sent each other's pending options without
-- ids, so the server created the same name two or three times. Per column this keeps the FIRST option of each
-- normalized name (array order = display order), remaps the cells and the view filters that point at a dropped
-- duplicate to the kept one, de-duplicates MULTI_SELECT arrays and drops any option id the column does not know
-- (e.g. a client temp id `tmp_…` — the server never accepted one, this is belt and braces). Idempotent: a second run
-- finds no duplicates and no unknown ids and changes nothing. Versions are bumped only on rows/columns/views it changes.
DO $$
DECLARE
  col record;
  r record;
  v record;
  opt jsonb;
  seen jsonb;
  remap jsonb;
  keep jsonb;
  known text[];
  k text;
  cell jsonb;
  next_cell jsonb;
  cfg jsonb;
  filters jsonb;
  f jsonb;
  next_filters jsonb;
  changed boolean;
BEGIN
  FOR col IN
    SELECT id, database_id, type, config
    FROM database_columns
    WHERE type IN ('SELECT', 'MULTI_SELECT') AND jsonb_typeof(config -> 'options') = 'array'
  LOOP
    seen := '{}'::jsonb;
    remap := '{}'::jsonb;
    keep := '[]'::jsonb;
    FOR opt IN SELECT o.value FROM jsonb_array_elements(col.config -> 'options') WITH ORDINALITY AS o(value, i) ORDER BY o.i
    LOOP
      k := lower(btrim(opt ->> 'name'));
      IF seen ? k THEN
        remap := remap || jsonb_build_object(opt ->> 'id', seen ->> k);
      ELSE
        seen := seen || jsonb_build_object(k, opt ->> 'id');
        keep := keep || jsonb_build_array(opt);
      END IF;
    END LOOP;
    SELECT coalesce(array_agg(o ->> 'id'), '{}') INTO known FROM jsonb_array_elements(keep) AS o;

    IF remap <> '{}'::jsonb THEN
      UPDATE database_columns
      SET config = jsonb_set(config, '{options}', keep), version = version + 1, updated_at = now()
      WHERE id = col.id;
    END IF;

    -- cells (live and soft-deleted rows alike: a restore must not bring a dropped id back)
    FOR r IN
      SELECT id, cells FROM database_rows WHERE database_id = col.database_id AND cells ? col.id::text
    LOOP
      cell := r.cells -> col.id::text;
      IF jsonb_typeof(cell) = 'string' THEN
        k := coalesce(remap ->> (cell #>> '{}'), cell #>> '{}');
        next_cell := CASE WHEN k = ANY (known) THEN to_jsonb(k) ELSE NULL END;
      ELSIF jsonb_typeof(cell) = 'array' THEN
        SELECT coalesce(jsonb_agg(to_jsonb(id) ORDER BY first_i), '[]'::jsonb) INTO next_cell
        FROM (
          SELECT m.id, min(m.i) AS first_i
          FROM (
            SELECT coalesce(remap ->> e.value, e.value) AS id, e.i
            FROM jsonb_array_elements_text(cell) WITH ORDINALITY AS e(value, i)
          ) m
          WHERE m.id = ANY (known)
          GROUP BY m.id
        ) d;
        IF next_cell = '[]'::jsonb THEN next_cell := NULL; END IF;
      ELSE
        next_cell := NULL;
      END IF;
      IF next_cell IS DISTINCT FROM cell THEN
        UPDATE database_rows
        SET cells = CASE WHEN next_cell IS NULL THEN cells - col.id::text
                         ELSE jsonb_set(cells, ARRAY[col.id::text], next_cell) END,
            version = version + 1
        WHERE id = r.id;
      END IF;
    END LOOP;

    -- view filters on this column whose value lists option ids
    IF remap <> '{}'::jsonb THEN
      FOR v IN SELECT id, config FROM database_views WHERE database_id = col.database_id
      LOOP
        cfg := v.config;
        filters := cfg -> 'filters';
        CONTINUE WHEN filters IS NULL OR jsonb_typeof(filters) <> 'array';
        next_filters := '[]'::jsonb;
        changed := false;
        FOR f IN SELECT e.value FROM jsonb_array_elements(filters) WITH ORDINALITY AS e(value, i) ORDER BY e.i
        LOOP
          IF f ->> 'columnId' = col.id::text AND jsonb_typeof(f -> 'value') = 'array' THEN
            SELECT coalesce(jsonb_agg(to_jsonb(id) ORDER BY first_i), '[]'::jsonb) INTO next_cell
            FROM (
              SELECT coalesce(remap ->> e.value, e.value) AS id, min(e.i) AS first_i
              FROM jsonb_array_elements_text(f -> 'value') WITH ORDINALITY AS e(value, i)
              GROUP BY 1
            ) d;
            IF next_cell IS DISTINCT FROM f -> 'value' THEN
              f := jsonb_set(f, '{value}', next_cell);
              changed := true;
            END IF;
          END IF;
          next_filters := next_filters || jsonb_build_array(f);
        END LOOP;
        IF changed THEN
          UPDATE database_views SET config = jsonb_set(config, '{filters}', next_filters), version = version + 1
          WHERE id = v.id;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END $$;
