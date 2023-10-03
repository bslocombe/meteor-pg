// pg-live-select, MIT License
var fs = require('fs');
var path = require('path');

var EventEmitter = require('events').EventEmitter;
var util = require('util');
var _ = require('lodash');
// var pg = require('pg');
var { Client } = require('pg');


var querySequence = require('./querySequence');
var LivePgKeySelector = require('./LivePgKeySelector.js');
var LivePgSelect = require('./LivePgSelect.js');
var QueryCache = require('./QueryCache');
var differ = require('./differ');

import EJSON from 'ejson'

/*
 * Duration (ms) to wait to check for new updates when no updates are
 *  available in current frame
 */
var STAGNANT_TIMEOUT = 100;

var TRIGGER_QUERY_TPL = Assets.getText('lib/trigger.tpl.sql');
var REFRESH_QUERY_TPL = Assets.getText('lib/refresh.tpl.sql');

const LivePgLib = function(settings, channel) {
  var self = this;
  EventEmitter.call(self);

  self.settings = settings;
  self.channel = channel;
  self.triggerFun = 'livepg_' + channel;
  self.notifyClient = null;
  self.notifyDone = null;
  self.waitingPayloads = {};
  self.waitingToUpdate = [];
  self.selectBuffer    = {};
  self.allTablesUsed   = {};
  self.tablesUsedCache = {};
  self._select = [];
  self._queryCache = {};
  self._schemaCache = {};

  

  self.db = new Client(settings)
  self.query = self.db.query.bind(self.db);
  self.endDbOrPool = function() {
		self.db.end();
	};
  initialConnect = self.db.connect.bind(self.db);
  initialConnect(function(error, client, done) {
    if (error) return self.emit('error', error);
    self.notifyDone = done;
    self.notifyClient = client;
    _.each(self._queryCache, function(cache) {
        cache.invalidate();
    });
    self._initTriggerFun();
    self._initListener();
    self._initUpdateLoop();
  })

}

util.inherits(LivePgLib, EventEmitter);

LivePgLib.prototype.select = function(query, values, keySelector, triggers, minInterval) {
  var self = this;

  if (!(typeof query === 'string'))
    throw new Error('query must be a string');
  if (!(typeof values === 'object' || values === undefined))
    throw new Error('values must be an object, null, or undefined');
  if (!(keySelector instanceof Function))
    throw new Error('keySelector required');
  if (!(triggers instanceof Array) || triggers.length === 0)
    throw new Error('triggers array required');
  if (!(typeof minInterval === 'number' || minInterval === undefined))
    throw new Error('minInterval must be a number or undefined');
  if(typeof query !== 'string')
    throw new Error('QUERY_STRING_MISSING');
  if(!(values instanceof Array))
    throw new Error('VALUES_ARRAY_MISMATCH');
  
  var queryCacheKey = EJSON.stringify({
    query: query,
    values: values,
    keySelector: LivePgKeySelector.makeTag(keySelector)
  }, {canonical: true});

  var queryCache;
  if (queryCacheKey in self._queryCache) {
    queryCache = self._queryCache[queryCacheKey];
  } else {
    queryCache = new QueryCache(query, values, queryCacheKey, keySelector, minInterval, self);
    self._queryCache[queryCacheKey] = queryCache;
  }

  var newSelect = new LivePgSelect(queryCache, queryCacheKey, triggers, self);
  self._select.push(newSelect);
  return newSelect;
}

LivePgLib.prototype._initTriggerFun = function() {
  var self = this;
  self.query(
    replaceQueryArgs(TRIGGER_QUERY_TPL,
      { funName: self.triggerFun, channel: self.channel })
  , function(error) {
    if(error) return self.emit('error', error);
  });
}

LivePgLib.prototype._initListener = function() {
  var self = this;

    self.notifyClient.query('LISTEN "' + self.channel + '"', function(error, result) {
      if(error) return self.emit('error', error);
    });

  self.notifyClient.on('notification', function(info) {
    if(info.channel === self.channel) {
      var payload = self._processNotification(info.payload);

      // Only continue if full notification has arrived
      if(payload === null) return;

      try {
        var payload = JSON.parse(payload);
      } catch(error) {
        return self.emit('error',
          new Error('INVALID_NOTIFICATION ' + payload));
      }

      if(payload.table in self.allTablesUsed) {

        _.each(self._queryCache, function(cache) {
          if ((self.settings.checkConditionWhenQueued
              || cache.updateTimeout === null)
              && cache.matchRowEvent(payload)) {
            cache.invalidate();
          }
        });
        
      }
    }
  })
}

LivePgLib.prototype._initUpdateLoop = function() {
  var self = this;

  var performNextUpdate = function() {
    if(self.waitingToUpdate.length !== 0) {
      var queriesToUpdate =
        _.uniq(self.waitingToUpdate.splice(0, self.waitingToUpdate.length));
      var updateReturned = 0;

      queriesToUpdate.forEach(function(queryHash) {
        self._updateQuery(queryHash, function(error) {
          updateReturned++;
          if(error) self.emit('error', error);
          if(updateReturned === queriesToUpdate.length) performNextUpdate();
        })
      });
    } else {
      // No queries to update, wait for set duration
      setTimeout(performNextUpdate, STAGNANT_TIMEOUT);
    }
  };

  performNextUpdate();
}

LivePgLib.prototype._processNotification = function(payload) {
  var self = this;
  var argSep = [];

  // Notification is 4 parts split by colons
  while(argSep.length < 3) {
    var lastPos = argSep.length !== 0 ? argSep[argSep.length - 1] + 1 : 0;
    argSep.push(payload.indexOf(':', lastPos));
  }

  var msgHash   = payload.slice(0, argSep[0]);
  var pageCount = payload.slice(argSep[0] + 1, argSep[1]);
  var curPage   = payload.slice(argSep[1] + 1, argSep[2]);
  var msgPart   = payload.slice(argSep[2] + 1, argSep[3]);
  var fullMsg;

  if(pageCount > 1) {
    // Piece together multi-part messages
    if(!(msgHash in self.waitingPayloads)) {
      self.waitingPayloads[msgHash] =
        _.range(pageCount).map(function() { return null });
    }
    self.waitingPayloads[msgHash][curPage - 1] = msgPart;

    if(self.waitingPayloads[msgHash].indexOf(null) !== -1) {
      return null; // Must wait for full message
    }

    fullMsg = self.waitingPayloads[msgHash].join('');

    delete self.waitingPayloads[msgHash];
  }
  else {
    // Payload small enough to fit in single message
    fullMsg = msgPart;
  }

  return fullMsg;
}

LivePgLib.prototype._updateQuery = function(queryHash, callback) {
  var self = this;
  var queryBuffer = self.selectBuffer[queryHash];

  var oldHashes = queryBuffer.data.map(function(row) { return row._hash; });

  pg.connect(self.connStr, function(error, client, done) {
    if(error) return callback && callback(error);
    client.query(
      replaceQueryArgs(REFRESH_QUERY_TPL, {
        query: queryBuffer.query,
        hashParam: queryBuffer.params.length + 1
      }),
      queryBuffer.params.concat([ oldHashes ]),
      function(error, result) {
        done();
        if(error) return callback && callback(error);
        processDiff(result.rows);
      }
    );
  });

  var processDiff = function(result) {
    var diff = differ.generate(oldHashes, result);
    var eventArgs;

    if(diff !== null) {
      var newData = differ.apply(queryBuffer.data, diff);
      queryBuffer.data = newData;

      var eventArgs = [
        'update',
        filterHashProperties(diff),
        filterHashProperties(newData)
      ];

    } else if(queryBuffer.initialized === false) {
      // Initial update with empty data
      var eventArgs = [
        'update',
        { removed: null, moved: null, copied: null, added: [] },
        []
      ];
    }

    if(eventArgs) {
      queryBuffer.handlers.forEach(function(handle) {
        handle.emit.apply(handle, eventArgs);
      });

      queryBuffer.initialized = true
    }

    // Update process finished
    callback && callback();
  }

}

LivePgLib.prototype._removeSelect = function(select) {
  var self = this;
  var index = self._select.indexOf(select);
  if (index !== -1) {
    // Remove the select object from our list
    self._select.splice(index, 1);

    var queryCache = select.queryCache;
    var queryCacheIndex = queryCache.selects.indexOf(select);
    if (queryCacheIndex !== -1) {
      // Remove the select object from the query cache's list and remove the
      // query cache if no select objects are using it.
      queryCache.selects.splice(queryCacheIndex, 1);
      if (queryCache.selects.length === 0) {
        delete self._queryCache[queryCache.queryCacheKey];
      }
    }

    return true;
  } else {
    return false;
  }
}

LivePgLib.prototype.end = function() {
  var self = this;
  self.endDbOrPool();
};

function replaceQueryArgs(query, args) {
  Object.keys(args).forEach(function(argName) {
    query = query.replace(
      new RegExp('\\\$\\\$' + argName + '\\\$\\\$', 'g'), args[argName]);
  });

  return query;
}

function filterHashProperties(diff) {
  if(diff instanceof Array) {
    return diff.map(function(event) {
      return _.omit(event, '_hash')
    });
  }
  // Otherwise, diff is object with arrays for keys
  _.forOwn(diff, function(rows, key) {
    diff[key] = filterHashProperties(rows)
  });
  return diff;
}

LivePgLib.LivePgSelect = LivePgSelect;

export default LivePgLib