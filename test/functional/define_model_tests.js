exports['should define simple model with basic string type'] = {
  metadata: { requires: { topology: ['single'] } },
  
  // The actual test we wish to run
  test: function(configure, test) {
    var mapper = require('../../lib/mapper')
      , StringType = require('../../lib/mapper').types.StringType;

    // Start the connection
    var m = mapper.connect(configure.url());
    
    // Create a model
    var Cat = m.define('Cat', {
      name: StringType(true, {
          mininumLength: 10
        , maximumLength: 255
      })
    });

    // Create an instance of the model
    var cat = new Cat({name: 'zillow'});
    cat.save(function(err) {
      test.equal(null, err);
      m.close();
      test.done();
    });
  }
}