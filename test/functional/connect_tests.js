exports['should correctly connect to mapper'] = {
  metadata: { requires: { topology: ['single'] } },
  
  // The actual test we wish to run
  test: function(configure, test) {
    mapper = require('../../lib/mapper');
    // Start the connection
    var m = mapper.connect(configure.url());
    // Create a model
    m.once('connect', function(m) {
      m.close();
      test.done();
    });
  }
}