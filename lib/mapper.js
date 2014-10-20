var MongoClient = require('mongodb').MongoClient
  , EventEmitter = require('events').EventEmitter
  , pluralize = require('pluralize')
  , inherits = require('util').inherits
  , f = require('util').format
  , Timestamp = require('mongodb').Timestamp
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

  var Model = function(name, options) {
    // If we have not provided a namespace use the plural
    var collectionName = options.collection || pluralize(name.toLowerCase());
    var collection = null;
    var dbName = null;
    // Fields not allowed to be mapped
    var reservedFields = ['save', 'reload', 'observe'];

    // Actual model function
    var modelCreationFunction = function(values) {
      var self = this;

      // Add the event emitter
      EventEmitter.call(this);

      // Set the ts of the document
      values._ts = new Timestamp();
      // If we have no revision set it
      if(!values._id) values._rev = 1;

      // Map a hash back
      var mapBackObjects = function(_this, _values) {
        // For all values add a getter and setter
        for(var name in _values) {
          if(reservedFields.indexOf(name) != -1) throw new MapperError(f('field %s is a reserved field name', name))
          _this[name] = _values[name];
        }
      }

      // Initial mapping of the hash to the instance
      mapBackObjects(self, values);

      // The observer
      var observer = function(changes) {
        self.emit('change', changes);
      }

      // Save a model
      this.save = function(callback) {
        if(client == null) return waitForConnect.push({obj: this, method: 'save', args: [callback]});
        // Set the dbName
        dbName = client.databaseName;
        // Save a collection instance if non provided
        if(!collection) collection = getCollection(client, collectionName);
        // Save the document to the collection
        collection.save(values, callback);
      }

      // Reload the entire model
      this.reload = function(callback) {
        if(values._id == null) throw new MapperError('cannot reload a document that has no _id');
        // Stop observing the object
        Object.unobserve(this, observer);
        // Remove any fields we have
        for(var name in values) {
          delete[name];
        }

        // Reload the document
        collection.findOne({_id: values._id}, function(err, doc) {
          if(err) return callback(err);
          if(doc == null) return callback(new MapperError(f('no document found for %s', values._id)));
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
          console.log("==================================================================")
          console.dir(change)

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
                  Object.observe(this, observer);
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

    // Return instance creator
    return modelCreationFunction;
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


module.exports = Mapper;
