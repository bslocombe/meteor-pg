/*
 * Template for refreshing a result set, only returning unknown rows
 * Accepts 2 arguments:
 * query: original query string
 * hashParam: count of params in original query + 1
 */
WITH
  res AS ($$query$$),
  data AS (
    SELECT
      res.*,
      MD5(CAST(ROW_TO_JSON(res.*) AS TEXT)) AS _hash,
      ROW_NUMBER() OVER () AS _index
    FROM res),
  data2 AS (
    SELECT
      1 AS _added,
      data.*
    FROM data
    WHERE NOT (_hash = ANY ($$$hashParam$$)))
SELECT
  data2.*,
  data._hash AS _hash
FROM data
LEFT JOIN data2
  ON (data._index = data2._index)
