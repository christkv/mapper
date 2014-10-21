var Db = require('mongodb').Db
  , ObjectID = require('mongodb').ObjectID
  , Collection = require('mongodb').Collection
  , Server = require('mongodb').Server
  , ReplSet = require('mongodb').ReplSet
  , Mongos = require('mongodb').Mongos;

var EventProvider = function(client) {
  var localDb = null;
  var writeResult = null;
  var lastOp = null;
  var queries = {};

  var createOpLogCursor = function(ts) {
    var query = ts ? { ts: { $gte: ts } } : {};
    var cursor = localDb.collection('oplog.$main')
      .find(query)
      .addCursorFlag('tailable', true)
      .addCursorFlag('awaitData', true)
      .addCursorFlag('noCursorTimeout', true)

    // Data handler
    cursor.on('data', function(entry) {
      // if(entry.op == 'u') {
      // console.dir("---------------------------------------- OPLOG ENTRY :: " + lastOp)
      // console.dir(entry)        
      // }

      // Save current oplog entry timestamp if it's newer than our last view
      if(lastOp != null && entry.ts.greaterThan(lastOp)) {
        lastOp = entry.ts;
      }

      var ns = entry.ns;
      // We have an update, let's listen to it
      if(entry.op == 'u' && queries[ns]) {
        for(var i = 0; i < queries[ns].length; i++) {
          // Get listener
          var listener = queries[ns][i];
          
          // Do we have an objectID
          if(entry.o2._id instanceof ObjectID) {
            if(listener.q._id instanceof ObjectID) {
              if(entry.o2._id.equals(listener.q._id)) {
                return listener.c(entry);
              }
            }
          }
        }
      }
    });

    // // Error handler
    // cursor.on('error', function(err) {
    //   console.dir("---------------------------------------- OPLOG ERROR")
    //   console.dir(err)
    // });

    // Close handler, reconnect to listen to the oplog
    cursor.on('close', function() {
      // console.dir("---------------------------------------- OPLOG CLOSE")
      createOpLogCursor(lastOp);
    });
  }

  // Listen to a query
  this.listen = function(namespace, query, callback) {
    if(queries[namespace] == null) queries[namespace] = [];
    queries[namespace].push({q: query, c: callback});
  }

  // Connecting to the oplog
  this.connect = function() {
    // Get the localDb
    localDb = client.db('local');
    // Create and listen to a cursor
    createOpLogCursor();
  }

  // Create a wrapped collection to ensure we track lastOp
  this.wrap = function(collectionName) {
    // Get the collection
    var collection = client.collection(collectionName);
    var insertMethod = collection.insert;
    var updateMethod = collection.update;
    var removeMethod = collection.remove;
    
    // Handle write Result Op
    var handleWriteOp = function(command, op, options, callback) {
      if(typeof options == 'function') callback = options, options = {};
      // Apply command override
      command.apply(collection, [op, options, function(err, r) {
        if(err == null) {
          writeResult = r;
          lastOp = r.result.lastOp;
        }

        callback(err, r);
      }]);    
    }

    var handleWriteUpdateOp = function(command, op, set, options, callback) {
      if(typeof options == 'function') callback = options, options = {};
      // Apply command override
      command.apply(collection, [op, set, options, function(err, r) {
        if(err == null) {
          writeResult = r;
          lastOp = r.result.lastOp;
        }

        callback(err, r);
      }]);        
    }

    // Override the collection write methods to capture lastOp value  
    collection.insert = function(op, options, callback) {
      handleWriteOp(insertMethod, op, options, callback);
    }

    collection.update = function(op, set, options, callback) {
      handleWriteUpdateOp(updateMethod, op, set, options, callback);
    }

    collection.remove = function(op, options, callback) {
      handleWriteOp(removeMethod, op, options, callback);
    }

    // Return wrapped collection
    return collection;
  }
}

module.exports = EventProvider;