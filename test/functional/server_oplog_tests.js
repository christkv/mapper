/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.shouldCorrectlyCallValidateCollectionUsingAuthenticatedMode = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap'] } },
  
  // The actual test we wish to run
  test: function(configure, test) {
    var db = configure.newDbInstance({}, {poolSize:1});
    db.open(function(err, db) {
      db.close();
      test.done();
    });
  }
}