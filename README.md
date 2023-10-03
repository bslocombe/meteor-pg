# benslocombe:pg

Reactive PostgreSQL for Meteor, Credits to original package by numtel, and inspired by vlasky mysql package, updated to get newer PG libraries, and refactored to not depend on other NPM package for simpler maintenance. 

Provides Meteor an integrated live select class, bringing reactive `SELECT` statement result sets from PostgreSQL >= 9.3 using pg notify. 

> If you do not have PostgreSQL server already installed, you may use [Meteor PG Server (only tested on osx)](https://github.com/bslocombe/meteor-pg-server) to bundle the PostgreSQL server directly to your Meteor application.

* [How to publish joined queries that update efficiently](https://github.com/numtel/meteor-pg/wiki/Publishing-Efficient-Joined-Queries)
* [Leaderboard example modified to use PostgreSQL](https://github.com/numtel/meteor-pg-leaderboard)

## Server Implements

This package provides the `LivePg` class (moved into this package lib)

### `LivePg.prototype.select()`

In this Meteor package, the `SelectHandle` object returned by the `select()` method is modified to act as a cursor that can be published.

```javascript
var liveDb = new LivePg(CONNECTION_STRING, CHANNEL);

Meteor.publish('allPlayers', function(){
  return liveDb.select('SELECT * FROM players ORDER BY score DESC');
});
```

## Client/Server Implements


Simply call `Meteor.subscribe()` as you would normally on the client. 



**Notes:**


## Closing connections between hot code-pushes

With Meteor's hot code-push feature, new triggers and functions on database server are created with each restart. In order to remove old items, a handler to your application process's `SIGTERM` signal event must be added that calls the `cleanup()` method on each `LivePg` instance in your application. Also, a handler for `SIGINT` can be used to close connections on exit.

On the server-side of your application, add event handlers like this:

```javascript

var liveDb = new LivePg(CONNECTION_STRING, CHANNEL);

var closeAndExit = function() {
  // Call process.exit() as callback
  liveDb.cleanup(process.exit);
};

// Close connections on hot code push
process.on('SIGTERM', closeAndExit);
// Close connections on exit (ctrl + c)
process.on('SIGINT', closeAndExit);
```

## Tests / Benchmarks

** tests are broken at this time **
The test suite does not require a separate Postgres server installation as it uses [Meteor PG Server (only tested on osx)](https://github.com/bslocombe/meteor-pg-server) to run the tests.

The database connection settings must be configured in `test/settings/local.json`.

The database specified should be an empty database with no tables because the tests will create and delete tables as needed.

```bash
# Install Meteor
$ curl -L https://install.meteor.com/ | /bin/sh

# Clone Repository
$ git clone https://github.com/numtel/meteor-pg.git
$ cd meteor-pg

# Optionally, configure port and data dir in test/settings/test.pg.json.
# If changing port, keep port value updated in test/index.es6 as well.

# Test database will be created in dbtest directory.

# Run test server
$ meteor test-packages ./

```

## Example Usage Publication
```js
var liveDb = new LivePg(Meteor.settings.private.postgres, 'test');

// uses the name of the publication as the name of the collection by default.
// option to override so you can have more than one publication for the same "collection" 
// this is the publication context.. 

// this._collection_name = "entities"

Meteor.publish('test', function(){
  this._collection_name = "entities" // override the default collection name to merge results into the entities collection
  let res = liveDb.select(
    `SELECT * from entity`,
    [], //query parameters if required
    LivePgKeySelector.Columns(['id']), //how to index the _id column for the result set
    [{table:'entity'}] //tables to create trigger functions in pg
  );
  return res;
})

var closeAndExit = function() {
  // Call process.exit() as callback
  liveDb.cleanup(process.exit);
};

// Close connections on hot code push
process.on('SIGTERM', closeAndExit);
// Close connections on exit (ctrl + c)
process.on('SIGINT', closeAndExit);
```

## License

MIT
