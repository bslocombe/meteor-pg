// Execute a sequence of queries on a node-pg database connection
// @param {object} connStr - Postgres connection string
// @param {boolean} debug - Print queries as they execute (optional)
// @param {[string]} queries - Queries to execute, in order
// @param {function} callback - Call when complete
querySequence = async function(connStr, debug, queries, callback){
  if(debug instanceof Array){
    callback = queries;
    queries = debug;
    debug = false;
  };

  const client = await pg.connect(connStr)
  let results = []

  queries.forEach(async (queryStr, index) => {
    debug && console.log('Query Sequence', index, queryStr);
    let params;
      if(queryStr instanceof Array) {
        params = queryStr[1];
        queryStr = queryStr[0];
      }

    let rows = client.query(queryStr, params)
    results.push(rows)

  })

  return results
};
