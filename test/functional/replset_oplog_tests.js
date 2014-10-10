var f = require('util').format;

var restartAndDone = function(configuration, test) {
  configuration.manager.restart(function() {
    test.done();
  });
}

exports['Should correctly connect with default replicaset'] = {
  metadata: { requires: { topology: 'replicaset' } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet
      , Server = configuration.require.Server
      , Db = configuration.require.Db;

    // Replset start port
    configuration.manager.shutdown('secondary', {signal:15}, function() {
      // Replica configuration
      var replSet = new ReplSet([
          new Server(configuration.host, configuration.port),
          new Server(configuration.host, configuration.port + 1),
          new Server(configuration.host, configuration.port + 2)
        ]
        , {rs_name:configuration.replicasetName}
      );

      var db = new Db('integration_test_', replSet, {w:0});
      db.open(function(err, p_db) {
        test.equal(null, err);
        p_db.close();
        restartAndDone(configuration, test);
      })
    });
  }
}