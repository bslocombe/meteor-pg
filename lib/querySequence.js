// pg-live-select, MIT License
var pg = require('pg');

// Perform a series of queries on a Postgres server
module.exports = function(connStr, queries, callback) {
  pg.connect(connStr, function(error, client, done) {
    if(error) return callback && callback(error);

    var performNext = function(index) {
      if(index < queries.length) {
        var query = queries[index];
        var params;
        if(query instanceof Array) {
          // Allow array containing [ query_string, params ]
          params = query[1];
          query = query[0];
        } else {
          params = [];
        }
        client.query(query, params, function(error, result) {
          if(error) {
            done();
            return callback && callback(error);
          }
          performNext(++index);
        });
      } else {
        done();
        callback && callback();
      }
    }

    performNext(0);
  });
}
