exports['should correctly receive a change notification for the saved document'] = {
  metadata: { requires: { topology: ['single'] } },
  
  // The actual test we wish to run
  test: function(configure, test) {
    var mapper = require('../../lib/mapper')
      , StringType = require('../../lib/mapper').types.StringType;

    // Start the connection
    var m = mapper.connect(configure.url(), {listenToEvents:true});
    
    // Create a model
    var Cat = m.define('Cat', {
      name: StringType(true, {
          mininumLength: 10
        , maximumLength: 255
      })
    }, {});

    // Wait for connection to happen
    m.on('connect', function() {

      // Clean out the collection for the test
      m.connection.collection('cats').remove({}, function(err) {

        // Create an instance of the model
        var cat = new Cat({name: 'zillow'});

        // Save the cat object
        cat.save(function(err) {
          test.equal(null, err);

          // Register cat instance for change events
          cat.observe();

          // Let's force an update of the cat using the raw driver, causing
          // an document change event to appear in the oplog
          m.connection
            .collection('cats')
            .update({name: 'zillow'}, {$set: {a:1}, $inc: {_rev: 1}}, function(err, result) {
              test.equal(null, err);
              test.equal(1, result.result.n);
            });
        });
        
        // Be notified of changes for the object
        cat.on('change', function(change) {
          if(change.type == 'add') {
            test.equal('a', change.name);
            test.equal(1, change.object[change.name]);
          } else if(change.type == 'update') {
            test.equal('_rev', change.name);
            test.equal(2, change.object[change.name]);
            test.equal(1, change.oldValue);
          }

          // Reload the cat
          cat.reload(function(err) {
            test.equal(null, err);

            m.close();
            test.done();      
          });
        });
      });
    });
  }
}

exports['should correctly update document after field change'] = {
  metadata: { requires: { topology: ['single'] } },
  
  // The actual test we wish to run
  test: function(configure, test) {
    var mapper = require('../../lib/mapper')
      , StringType = require('../../lib/mapper').types.StringType;

    // Start the connection
    var m = mapper.connect(configure.url(), {listenToEvents:true});
    
    // Create a model
    var Cat = m.define('Cat', {
      name: StringType(true, {
          mininumLength: 10
        , maximumLength: 255
      })
    }, {});

    // Wait for connection to happen
    m.on('connect', function() {

      // Clean out the collection for the test
      m.connection.collection('cats').remove({}, function(err) {

        // Create an instance of the model
        var cat = new Cat({name: 'zillow'});

        // Save the cat object
        cat.save(function(err) {
          test.equal(null, err);

          // Register cat instance for change events
          cat.observe();

          // Modify the document field
          cat.name = 'zillow2';

          // Save the changed instance
          cat.save(function(err) {
            test.equal(null, err);

            m.close();
            test.done();      
          });

          // // Let's force an update of the cat using the raw driver, causing
          // // an document change event to appear in the oplog
          // m.connection
          //   .collection('cats')
          //   .update({name: 'zillow'}, {$set: {a:1}, $inc: {_rev: 1}}, function(err, result) {
          //     test.equal(null, err);
          //     test.equal(1, result.result.n);
          //   });
        });
        
        // Be notified of changes for the object
        cat.on('change', function(change) {
          console.log("----------------------------------- change")
          console.dir(change)
          // if(change.type == 'add') {
          //   test.equal('a', change.name);
          //   test.equal(1, change.object[change.name]);
          // } else if(change.type == 'update') {
          //   test.equal('_rev', change.name);
          //   test.equal(2, change.object[change.name]);
          //   test.equal(1, change.oldValue);
          // }

          // // Reload the cat
          // cat.reload(function(err) {
          //   test.equal(null, err);

          //   m.close();
          //   test.done();      
          // });
        });
      });
    });
  }
}