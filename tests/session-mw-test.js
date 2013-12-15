'use strict';

var connect = require('connect'),
    Q = require('q'),
    _ = require('lodash'),
    apiman = require('../')
    ;

/** Test session middleware
 * @param {test|assert} test
 */
exports.testSessionMiddleware = function(test){
    // Resources
    var root = new apiman.Root;

    // Middleware
    root.use(apiman.middleware.session({
        store: new connect.session.MemoryStore
    }));

    // Methods
    root.method('get', function(req, res){
        res.ok({ req:req });
    });

    root.method('set', function(req, res){
        req.session[req.args.name] = req.args.val;
        res.ok({ req:req });
    });

    var sessionID; // remember the session

    // Tests
    [
        // Creation test
        function(){
            return root.exec('', 'get')
                .then(function(result){
                    test.ok(result.req.sessionStore !== undefined);

                    test.ok(result.req.sessionID !== undefined);
                    test.equal(result.req.sessionID.length, 24);

                    test.ok(result.req.session !== undefined);
                    test.deepEqual(_.keys(result.req.session), ['cookie']);
                });
        },
        // Get the session
        function(){
            var req = {};
            return root.exec('', 'get', {}, req)
                .then(function(result){
                    test.ok(req.sessionID !== undefined);
                    sessionID = req.sessionID;
                });
        },
        // Persistence test
        function(){
            process.env.DEBUG = 1;

            return [
                function(){ return root.exec('', 'set', { name: 'first', val: 1 },  { sessionID: sessionID }); },
                function(){ return root.exec('', 'set', { name: 'second', val: 2 },  { sessionID: sessionID }); },
                function(){ return root.exec('', 'set', { name: 'third', val: 3 },  { sessionID: sessionID }); }
            ].reduce(Q.when, Q(1))
                .delay(100) // give the session storage backend has a chance to save the session data
                .then(function(){
                    return root.exec('', 'get', {}, { sessionID: sessionID })
                        .then(function(result){
                            var session = result.req.session;
                            test.strictEqual(session.first, 1);
                            test.strictEqual(session.second, 2);
                            test.strictEqual(session.third, 3);
                        });
                });
        }
    ].reduce(Q.when, Q())
        .catch(function(err){ test.ok(false, err.stack) })
        .finally(function(){ test.done(); })
        .done();
};
