var EventEmitter = require('events').EventEmitter
  , inherits = require('util').inherits;

var ServerProvider = function(db) {
  EventEmitter.call(this);

  ServerProvider.listen = function(collection, filter) {    
  }
}

inherits(ServerProvider, EventEmitter);

module.exports = ServerProvider;