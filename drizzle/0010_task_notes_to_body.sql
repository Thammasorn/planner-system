-- Custom SQL migration file, put your code below! --
-- FR-692 / AC-627 (plan/m06.1 S0.3, M6.1-D3): every non-blank tasks.notes becomes the task's TASK page.
-- * lines split on CRLF / CR / LF; leading and trailing blank lines dropped; every remaining line = one partial
--   paragraph block {type:'paragraph', content: line} (verbatim); a blank inner line = {type:'paragraph'}
-- * content_text = extractContentText(content) (src/lib/editor/content-text.ts): lines joined with ' ', NFC,
--   zero-width characters removed, JS-\s whitespace collapsed to one space, trimmed
-- * "blank" = only JS-\s whitespace ([\t\n\v\f\r    -     　﻿])
-- * space PROJECT, the task's project, title '', key 'a0', version 1, created_by = updated_by = tasks.created_by,
--   deleted_at / deleted_batch copied from the task (an undo of the task delete restores both)
-- * idempotent (NOT EXISTS); no audit rows (schema migration, not a user action)
WITH src AS (
  SELECT t.id, t.project_id, t.created_by, t.deleted_at, t.deleted_batch,
         string_to_array(regexp_replace(t.notes, '\r\n?', E'\n', 'g'), E'\n') AS raw
  FROM tasks t
  WHERE t.notes IS NOT NULL
    AND t.notes !~ '^[\t\n\v\f\r    -     　﻿]*$'
    AND NOT EXISTS (SELECT 1 FROM pages p WHERE p.task_id = t.id)
),
lines AS (
  SELECT s.id, l.line, l.n,
         l.line ~ '^[\t\n\v\f\r    -     　﻿]*$' AS blank
  FROM src s, unnest(s.raw) WITH ORDINALITY AS l(line, n)
),
bounds AS (
  SELECT id, min(n) FILTER (WHERE NOT blank) AS lo, max(n) FILTER (WHERE NOT blank) AS hi
  FROM lines GROUP BY id
),
docs AS (
  SELECT l.id,
         jsonb_agg(CASE WHEN l.blank THEN jsonb_build_object('type', 'paragraph')
                        ELSE jsonb_build_object('type', 'paragraph', 'content', l.line) END ORDER BY l.n) AS content,
         string_agg(l.line, ' ' ORDER BY l.n) AS joined
  FROM lines l JOIN bounds b ON b.id = l.id
  WHERE l.n BETWEEN b.lo AND b.hi
  GROUP BY l.id
)
INSERT INTO pages (space, project_id, kind, task_id, title, content, content_text, position,
                   created_by, updated_by, deleted_at, deleted_batch)
SELECT 'PROJECT', s.project_id, 'TASK', s.id, '', d.content,
       regexp_replace(
         regexp_replace(
           regexp_replace(normalize(d.joined, NFC), '[​-‍⁠﻿]', '', 'g'),
           '[\t\n\v\f\r    -     　﻿]+', ' ', 'g'),
         '^ | $', '', 'g'),
       'a0', s.created_by, s.created_by, s.deleted_at, s.deleted_batch
FROM src s JOIN docs d ON d.id = s.id;
