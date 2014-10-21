var MongoClient = require('mongodb').MongoClient
  , EventEmitter = require('events').EventEmitter
  , pluralize = require('pluralize')
  , inherits = require('util').inherits
  , f = require('util').format
  , Timestamp = require('mongodb').Timestamp
  , Logger = require('mongodb').Logger
  , EventProvider = require('./event_provider')
  , MapperError = require('./error')
  , Collection = require('mongodb').Collection;

//
// Actual Mapper instance
//
var Mapper = function(opts) {
  // Let's mer
  EventEmitter.call(this);

  // Internal state
  var state = 'connecting';
  var client;
  var modelClasses = {};
  var waitForConnect = [];
  var provider = null;
  var writeResult = null;

  // Logger
  var logger = Logger('Mapper', opts);

  // Flags for the mapper
  var listenToEvents = typeof opts.listenToEvents == 'boolean' ? opts.listenToEvents : false;

  // Access all the available mappers
  Object.defineProperty(this, 'mappers', {
      enumberable: true
    , get: function() {
      return {}
    }
  });

  // Access all the available mappers
  Object.defineProperty(this, 'connection', {
      enumberable: true
    , get: function() {
      return client
    }
  });

  this.init = function(_client) {
    client = _client;    
    
    // If we have a listenToEvents we are going to start the listening
    // to the oplog entries
    if(listenToEvents) {
      // Create a new event provider
      provider = new EventProvider(client);
      // Connect to events source
      provider.connect();
    }

    // Set connected
    state = 'connected';
    // Execute all waiting operations
    while(waitForConnect.length > 0) {
      var command = waitForConnect.shift();
      command.obj[command.method].apply(command.obj, command.args);
    }

    // Emit connect event
    this.emit('connect', this);
  }

  this.close = function() {
    client.close();
  }

  var getCollection = function(client, collectionName) {
    if(!listenToEvents) return client.collection(collectionName);
    return provider.wrap(collectionName);
  }

  var Model = function(name, _options) {
    // If we have not provided a namespace use the plural
    var collectionName = _options.collection || pluralize(name.toLowerCase());
    var collection = null;
    var dbName = null;
    
    //
    // Fields not allowed to be mapped
    var reservedFields = ['save', 'reload', 'observe'];
    var observers = [];

    //
    // Create model object
    var createModel = function(options) {
      // Actual model function
      var modelCreationFunction = function(values) {
        var self = this;
        // Contains all changes
        var changes = [];

        // Add the event emitter
        EventEmitter.call(this);

        // Set the ts of the document
        values._ts = new Timestamp();
        // If we have no revision set it
        if(!values._id) values._rev = 1;

        // The observer
        var observer = function(name){
          var ob = function(change) {
            if(logger.isDebug()) logger.debug(f('received Object.observer message for %s', name), change);
            changes = changes.concat({name: name, changes:change});
            self.emit('change', change, name);
          }

          // Set the name
          ob.name = name;
          // Observers
          observers.push(ob);
          return ob;
        }

        // Map a hash back
        var mapBackObjects = function(_this, _values) {
          // For all values add a getter and setter
          for(var name in _values) {
            if(reservedFields.indexOf(name) != -1) throw new MapperError(f('field %s is a reserved field name', name))
            _this[name] = _values[name];

            // If we have an array add an observer
            if(Array.isArray(_this[name])) {
              Array.observe(_this[name], observer(name));
            }
          }
        }

        // Initial mapping of the hash to the instance
        mapBackObjects(self, values);

        // Execute an update
        var executeUpdate = function(callback) {
          // Ensure all observe events fired
          process.nextTick(function() {
            // Update statement
            var update = {};
            var selector = {_id: values._id, _rev: values._rev};

            // Iterate over all the changes to create the
            // update statements
            for(var i = 0; i < changes.length; i++) {

              // Unpack a change object
              var changeObj = changes[i];
              // console.dir(changeObj)
              var obChanges = changeObj.changes;
              var obName = changeObj.name;

              for(var j = 0; j < obChanges.length; j++) {
                var change = obChanges[j];
                // obName = change.name || obName;

                // console.log("-------------------------------------- apply change --- 2")
                // console.dir(change)

                // We have an update change
                if(change.type == 'update') {
                  if(!update['$set']) update['$set'] = {};

                  // We have an array
                  if(Array.isArray(change.object)) {
                    // if(parseInt(change.))
                    update['$set'][f("%s.%s", obName, change.name)] = change.object[change.name];
                  } else {
                    update['$set'][change.name] = change.object[change.name];
                  }
                } else if(change.type == 'splice') {
                  if(!update['$set']) update['$set'] = {};
                  update['$set'][obName] = change.object;
                  // // We have an array splice operation
                  // if(change.removed) {
                  //   var pushObj = {};
                  //   pushObj[obName] = {
                  //       $each: change.object.slice(change.index, change.addedCount)
                  //     , $position: change.index
                  //   }
                  //   update['$push'] = pushObj;
                  // }
                }               
              }
            }

            // Increment the operation
            if(!update['$inc']) update['$inc'] = {_rev: 1};
            // Update the time stamp
            if(!update['$set']) update['$set'] = {};
            update['$set']._ts = new Timestamp();

            // Log the content
            if(logger.isDebug()) {
              logger.debug(f('locate document with %s', selector._id), JSON.stringify(selector));
              logger.debug(f('update document with %s', selector._id), JSON.stringify(update));
            }

            // console.log("----------------------------------------- PERFORM UPDATE")
            // console.dir(selector)
            // console.dir(update)

            // Execute the object update
            collection.updateOne(selector, update, {}, function(err, result) {
              if(err) return callback(err);
              if(result.result.n == 0) return callback(new MapperError(f('could not update document with _id = %s')));
              callback();
            });
          });
        }

        // Save a model
        this.save = function(callback) {
          if(client == null) return waitForConnect.push({obj: this, method: 'save', args: [callback]});
          // Set the dbName
          dbName = client.databaseName;
          // Save a collection instance if non provided
          if(!collection) collection = getCollection(client, collectionName);
          // Save the document to the collection
          if(values._id == null) {
            changes = [];
            return collection.save(values, function(err, r) {
              if(err) return callback(err);
              values._id = r.ops[0]._id;
              self._id = r.ops[0]._id;
              callback();
            });
          }
          // We need to execute an update
          executeUpdate(callback);
        }

        // Reload the entire model
        this.reload = function(callback) {
          if(values._id == null) throw new MapperError('cannot reload a document that has no _id');
          // Stop observing the object
          for(var i = 0; i < observers.length; i++) {
            var ob = observers[i];
            if(ob.name) {
              Object.unobserve(this[name], ob);
            } else {
              Object.unobserve(this, ob);
            }
          }

          // Remove any fields we have
          for(var name in values) {
            delete[name];
          }

          // Reload the document
          collection.findOne({_id: values._id}, function(err, doc) {
            if(err) return callback(err);
            if(doc == null) return callback(new MapperError(f('no document found for %s', values._id)));
            // Clear out the changes
            changes = [];
            // Save the values
            values = doc;
            // For all values add a getter and setter
            mapBackObjects(self, doc);
            // Return successful
            callback();
          });
        }

        // Listen to changes in model
        this.observe = function() {
          if(values._id == null) throw new MapperError('cannot listen to a model instance that is saved');

          // Handles all the relevant change elements
          provider.listen(f('%s.%s', dbName, collectionName), {_id: values._id}, function(change) {
            // console.log("Bayonetta: Bloody Fate==================================================================")
            // console.dir(change)

            // Unpack parameters
            var op = change.op;
            var o = change.o;

            // If we have an update operation
            if(op == 'u') {

              // Do we have a set
              if(o['$set']) {
                
                // We have a valid rev
                if(o['$set']._rev == (self._rev + 1)) {

                  // apply all the values
                  for(var name in o['$set']) {
                    self[name] = o['$set'][name];
                  }
                } else {

                  self.reload(function(err) {
                    if(err) return self.emit('error', err);
                    // Start observing the object again
                    Object.observe(this, observer());
                  });
                }
              }
            }
          });
        }

        // Let's observe the object
        Object.observe(this, observer);
      }

      // inherit from the EventEmitter
      inherits(modelCreationFunction, EventEmitter);

      // Add static methods
      modelCreationFunction.extend = function(opt) {
        return createModel(mergeOptions(options, opt));
      }

      // Return instance creator
      return modelCreationFunction;
    }

    // The function model
    return createModel(_options);
  }

  this.define = function(name, schema, options) {
    modelClasses[name] = Model(name, schema, options);
    return modelClasses[name];
  }
}

inherits(Mapper, EventEmitter);

Mapper.connect = function(uri, options) {
  options = options || {};
  var mapper = new Mapper(options);

  // Connect to the server
  MongoClient.connect(uri, options, function(err, client) {
    if(err) throw err;
    mapper.init(client);
  });

  // Return the instance we created
  return mapper;
}

Mapper.extend = function(type, validatorFunction) {
}

var StringType = function(required, options) {  
}

Object.defineProperty(Mapper, 'types', {
    enumberable: true
  , get: function() {
    return {
      StringType: StringType
    }
  }
});

var mergeOptions = function(o, o2) {
  var n = {};
  for(var name in o) n[name] = o[name];
  for(var name in o2) n[name] = o2[name];
  return n;
}

module.exports = Mapper;
