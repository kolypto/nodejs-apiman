'use strict';

var Q = require('q'),
    _ = require('lodash'),
    apiman = require('../')
    ;

/** Generic ApiMan test
 * @param {test|assert} test
 */
exports.testApiMan = function(test){
    // Structure
    var root = new apiman.Root(),
        user = root.resource('/user'),
            profile = user.resource('/profile'),
        news = root.resource('/news')
        ;

    // Methods
    root.method(['echo', 'hello'], function(req, res){
        res.ok(req.args.name);
    });

    user.method('get', function(req, res){
        if (_.isUndefined(req.args.id))
            return res.error(new Error('User id not specified'));

        return Q()
            .delay(10)
            .then(function(){
                if (req.args.id > 10)
                    res.error(new Error('Not found'));
                else
                    res.ok({ login: 'kolypto' });
            });
    });

    user.method('set', function(req, res){
        res.ok({ saved: true });
    });

    profile.method('upd', function(req, res){
        res.ok();
    });

    news.method('list', function(req, res){
        return Q().delay(10)
            .then(function(){
                res.ok([ 1,2,3 ]);
            });
    });

    // Test structure
    test.deepEqual(_.keys(root.resources), ['/user', '/news']);
    test.deepEqual(_.keys(root.methods), ['echo', 'hello']);
    test.deepEqual(_.keys(user.resources), ['/profile']);
    test.deepEqual(_.keys(user.methods), ['get', 'set']);
    test.deepEqual(_.keys(profile.resources), []);
    test.deepEqual(_.keys(profile.methods), ['upd']);
    test.deepEqual(_.keys(news.resources), []);
    test.deepEqual(_.keys(news.methods), ['list']);

    // Run methods
    return [
        // root#echo
        function(){
            return root.exec('', 'echo', { name: 'kolypto' })
                .then(function(result){
                    test.equal(result, 'kolypto');
                });
        },
        // root#hello
        function(){
            return root.exec('', 'hello', { name: 'kolypto' })
                .then(function(result){
                    test.equal(result, 'kolypto');
                });
        },
        // user#get
        function(){
            return root.exec('/user', 'get', { id: 1 })
                .then(function(result){
                    test.deepEqual(result, { login: 'kolypto' });
                });
        },
        // user#get -> error: no argument
        function(){
            return root.exec('/user', 'get', {})
                .then(function(result){
                    test.ok(false);
                })
                .catch(function(err){
                    test.ok(err instanceof Error);
                    test.equal(err.message, 'User id not specified');
                });
        },
        // user#get -> error: not found
        function(){
            return root.exec('/user', 'get', { id: 999 })
                .then(function(result){
                    test.ok(false);
                })
                .catch(function(err){
                    test.ok(err instanceof Error);
                    test.equal(err.message, 'Not found');
                });
        },
        // user#set
        function(){
            return root.exec('/user', 'set')
                .then(function(result){
                    test.deepEqual(result, { saved: true });
                });
        },
        // profile#upd
        function(){
            return root.exec('/user/profile', 'upd')
                .then(function(result){
                    test.strictEqual(result, undefined);
                });
        },
        // news#list
        function(){
            return root.exec('/news', 'list')
                .then(function(result){
                    test.deepEqual(result, [ 1,2,3 ]);
                });
        },
    ].reduce(Q.when, Q())
        .catch(function(err){ test.ok(false, err.stack) })
        .finally(function(){ test.done(); })
        .done();
};

/** Middleware
 * @param {test|assert} test
 */
exports.testMiddleware = function(test){
    test.done();
};

/** Error handling
 * @param {test|assert} test
 */
exports.testErrors = function(test){
    test.done();
};

/** Endpoint Resource
 * @param {test|assert} test
 */
exports.testResourceEndpoint = function(test){
    test.done();
};

/** Controller Resource
 * @param {test|assert} test
 */
exports.testResourceController = function(test){
    test.done();
};
