// Write your package code here!

// Variables exported by this module can be imported by other packages and
// applications. See pg2-tests.js for an example of importing.
// var Future = Npm.require('fibers/future');

import _ from 'lodash'

import LivePgLib from './lib/LivePgLib';
import LivePgKeySelector from './lib/LivePgKeySelector';

// Convert the LivePg.LivePg object into a cursor
const LivePg = LivePgLib

LivePg.LivePgSelect.prototype._publishCursor = function(sub) {
  var self = this;
  return new Promise((resolve, reject)=>{

  sub.onStop(async function(){
    return await self.stop();
  });

  // Send reset message (for code pushes)
  // sub._session.send({
  //   msg: 'added',
  //   collection: sub._name,
  //   id: sub._subscriptionId,
  //   fields: { reset: true }
  // });

  // Send aggregation of differences
  self.on('update', function(diff, rows){
    try{
      if (diff.removed) {
        _.each(diff.removed, function(dummy, rowKey) {
          sub.removed(sub._collection_name || sub._name, rowKey);
        });
      }
      if (diff.added) {
        _.each(diff.added, function(row, rowKey) {
          sub.added(sub._collection_name || sub._name, rowKey, row);
        });
      }
      if (diff.changed) {
        _.each(diff.changed, function(fields, rowKey) {
          sub.changed(sub._collection_name || sub._name, rowKey, fields);
        });
      }
    }
    catch (e)
    {
        // Future versions may add special handling code
        // At the moment, we are happy simply to not crash the application
    }
    if(sub._ready === false ){
      resolve('')
    }
  });

  // Fail on error
  self.on('error', function(error){
      reject(error);
  });

  })
}

// Support for simple:rest

// Result set data does not exist in a Mongo Collection, provide generic name
LivePg.LivePgSelect.prototype._cursorDescription = { collectionName: 'data' };

LivePg.LivePgSelect.prototype.fetch = function() {
  // HttpSubscription object requires _id field for added() method
  var self = this;
  var dataWithIds = Object.keys(self.queryCache.data).map(function(rowKey, index) {
    var clonedRow = _.clone(self.queryCache.data[rowKey]);
    if (!('_id' in clonedRow)) {
      clonedRow._id = rowKey;
    }

    // Ensure row index is included since response will not be ordered
    if (!('_index' in clonedRow)) {
      clonedRow._index = index + 1;
    }

    return clonedRow;
  });

  return dataWithIds;
}


export {LivePg, LivePgKeySelector}
