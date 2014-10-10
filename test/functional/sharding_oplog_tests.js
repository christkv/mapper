var f = require('util').format;

/**
 * @ignore
 */
exports['Should connect to mongos proxies using connectiong string and options'] = {
  metadata: { requires: { topology: 'mongos' } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;

    var url = f('mongodb://%s:%s,%s:%s/sharded_test_db?w=1&readPreference=secondaryPreferred&readPreferenceTags=sf%3A1&readPreferenceTags='
      , configuration.host, configuration.port
      , configuration.host, configuration.port + 1);
    MongoClient.connect(url, {
      mongos: {
        haInterval: 500
      }
    }, function(err, db) {
      test.equal(null, err);
      test.ok(db != null);
      test.equal(500, db.serverConfig.haInterval);

      db.collection("replicaset_mongo_client_collection").update({a:1}, {b:1}, {upsert:true}, function(err, result) {
        test.equal(null, err);
        test.equal(1, result);

        // Perform fetch of document
        db.collection("replicaset_mongo_client_collection").findOne(function(err, d) {
          test.equal(null, err);

          db.close();
          test.done();
        });
      });    
    });
  }
}