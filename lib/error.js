/**
 * Creates a new MapperError
 * @class
 * @augments Error
 * @param {string} message The error message
 * @return {MapperError} A cursor instance
 */
function MapperError(message) {
  this.name = 'MapperError';
  this.message = message;
  this.stack = (new Error()).stack;
}

/**
 * Creates a new MongoError object
 * @class
 * @param {object} options The error options
 * @return {MongoError} A cursor instance
 */
MapperError.create = function(options) {
  var err = null;

  if(options instanceof Error) {
    err = new MapperError(options.message);
    err.stack = options.stack;
  } else if(typeof options == 'string') {
    err = new MapperError(options);
  } else {
    err = new MapperError(options.message || "n/a");
    // Other options
    for(var name in options) {
      err[name] = options[name];
    }
  }

  return err;
}

// Extend JavaScript error
MapperError.prototype = new Error; 

module.exports = MapperError;