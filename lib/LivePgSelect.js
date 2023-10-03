/* lib/LivePgSelect.js - Select result set class */
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var _ = require('lodash');

function LivePgSelect(queryCache, queryCacheKey, triggers, base) {
  if (!queryCache)
    throw new Error('queryCache required');
  if (!(triggers instanceof Array))
    throw new Error('triggers array required');
  if (typeof base !== 'object')
    throw new Error('base LivePg instance required');

  var self = this;
  EventEmitter.call(self);
  self.triggers = triggers;
  self.base = base;
  self.data = {};
  self.queryCache = queryCache;
  queryCache.selects.push(self);

  if (queryCache.initialized) {
    var refLastUpdate = queryCache.lastUpdate;
    // Trigger events for existing data
    setImmediate(function() {
      if (queryCache.lastUpdate !== refLastUpdate) {
        // Query cache has been updated since this select object was created;
        // our data would've been updated already.
        return;
      }

      self.emit('update',
        { added: queryCache.data, changed: null, removed: null },
        queryCache.data);
    });
  } else {
    queryCache.invalidate();
  }

  for (var i = 0; i < triggers.length; i++){
    let table = triggers[i].table;
      if(!(table in base.allTablesUsed)) {
        base.allTablesUsed[table] = [ queryCacheKey ];
        var triggerName = base.channel + '_' + table;
        base.query(
          'DROP TRIGGER IF EXISTS "' + triggerName + '" ON "' + table + '"');
        base.query(
          'CREATE TRIGGER "' + triggerName + '" ' +
            'AFTER INSERT OR UPDATE OR DELETE ON "' + table + '" ' +
            'FOR EACH ROW EXECUTE PROCEDURE "' + base.triggerFun + '"()');
      } else if(base.allTablesUsed[table].indexOf(queryCacheKey) === -1) {
        base.allTablesUsed[table].push(queryCacheKey);
    }
  }
}

util.inherits(LivePgSelect, EventEmitter);

LivePgSelect.prototype.matchRowEvent = function(eventName, tableName, rows) {
  var self = this;
  var trigger, row, rowDeleted;
  for (var i = 0; i < self.triggers.length; i++) {
    trigger = self.triggers[i];

    if (trigger.table === tableName) {
      if (trigger.condition === undefined) {
        return true;
      } else {
        for (var r = 0; r < rows.length; r++) {
          row = rows[r];
          if (eventName === 'updaterows') {
            return trigger.condition.call(self, row.before, row.after, null);
          } else {
            // writerows or deleterows
            rowDeleted = eventName === 'deleterows';
            return trigger.condition.call(self, row, null, rowDeleted);
          }
        }
      }
    }
  }
  return false;
};

LivePgSelect.prototype.stop = function() {
  var self = this;
  return self.base._removeSelect(self);
};

LivePgSelect.prototype.active = function() {
  var self = this;
  return self.base._select.indexOf(self) !== -1;
};

LivePgSelect.prototype.invalidate = function() {
  var self = this;
  self.queryCache.invalidate();
};

module.exports = LivePgSelect;
