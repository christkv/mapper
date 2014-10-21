exports['should correctly change an array field'] = {
  metadata: { requires: { topology: ['single'] } },
  
  // The actual test we wish to run
  test: function(configure, test) {
    var mapper = require('../../lib/mapper');

    // Start the connection
    var m = mapper.connect(configure.url(), {listenToEvents:true});
    
    // Create a model
    var Cat = m.define('Cat', {
      tags: { type: Array, required: false }
    }, {});

    // Wait for connection to happen
    m.on('connect', function() {

      // Clean out the collection for the test
      m.connection.collection('cats').remove({}, function(err) {

        // Create an instance of the model
        var cat = new Cat({name: 'zillow', tags: ['a', 'b', 'c', 'd']});

        // Save the cat object
        cat.save(function(err) {
          test.equal(null, err);

          // Modify the document field
          cat.tags[2] = 'f';

          // Save the changed instance
          cat.save(function(err) {
            test.equal(null, err);

            // Let's grab the real document
            m.connection.collection('cats').findOne({_id: cat._id}, function(err, doc) {
              test.equal(null, err);
              test.deepEqual(['a', 'b', 'f', 'd'], doc.tags);

              m.close();
              test.done();      
            });
          });
        });
      });
    });
  }
}

exports['should correctly push to array'] = {
  metadata: { requires: { topology: ['single'] } },
  
  // The actual test we wish to run
  test: function(configure, test) {
    var mapper = require('../../lib/mapper')
      , Logger = require('mongodb').Logger;

    // Set debug log level
    Logger.setLevel('debug');
    Logger.filter('class', ['Mapper']);

    // Start the connection
    var m = mapper.connect(configure.url(), {listenToEvents:true});
    
    // Create a model
    var Cat = m.define('Cat', {
      tags: { type: Array, required: false, of: { type: String } }
    }, {});

    // Wait for connection to happen
    m.on('connect', function() {

      // Clean out the collection for the test
      m.connection.collection('cats').remove({}, function(err) {

        // Create an instance of the model
        var cat = new Cat({name: 'zillow', tags: ['a', 'b', 'c', 'd']});

        // Save the cat object
        cat.save(function(err) {
          test.equal(null, err);

          // Splice the tags, this is slow as it's a full array replace
          cat.tags = cat.tags.splice(0, 2, 'parrot', 'anemone', 'blue');

          // Save the changed instance
          cat.save(function(err) {
            test.equal(null, err);

            // Let's grab the real document
            m.connection.collection('cats').findOne({_id: cat._id}, function(err, doc) {
              test.equal(null, err);
              test.deepEqual([ 'parrot', 'anemone', 'blue', 'c', 'd' ], doc.tags);
              // console.log("------------------------------------------------------- DONE")
              // console.dir(err)
              // console.dir(doc)

              m.close();
              test.done();      
            });
          });
        });
      });
    });
  }
}