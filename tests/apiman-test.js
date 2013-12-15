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

/** Request, Middleware
 * @param {test|assert} test
 */
exports.testMiddleware = function(test){
    // Structure
    var root = new apiman.Root(),
            user = root.resource('/user'),
                profile = user.resource('/profile'),
            news = root.resource('/news')
        ;

    // Middleware
    root.use(function(req, res){
        req.field = 'r';
    });

    user.use(function(req, res){
        req.field += 'u';
    });

    profile.use(function(req, res){
        return Q().delay(10)
            .then(function(){
                req.field += 'p';
            });
    });

    news.use(function(req, res){
        return Q().delay(10)
            .then(function(){
                res.ok('response from news mw');
            });
    });

    // Methods
    var method_execcount = 0;
    var method = function(req, res){
        method_execcount++;
        res.ok({
            // Request fields
            path: req.path,
            verb: req.verb,
            args: req.args,
            path_arr: req.path_arr,
            // Custom field
            field: req.field
        });
    };

    root.method('echo', method);
    user.method('echo', method);
    profile.method('echo', function(req, res){
        return Q().delay(10)
            .then(function(){
                req.field += 'm';
        });
    }, method);
    news.method('echo', method);

    // Call the methods
    [
        // root.echo
        function(){
            return root.exec('', 'echo')
                .then(function(result){
                    test.deepEqual(result, {
                        path: '',
                        verb: 'echo',
                        args: {},
                        path_arr: [],
                        field: 'r'
                    });
                });
        },
        // user.echo
        function(){
            return root.exec('/user', 'echo', { a:1 })
                .then(function(result){
                    test.deepEqual(result, {
                        path: '/user',
                        verb: 'echo',
                        args: { a:1 },
                        path_arr: ['/user'],
                        field: 'ru'
                    });
                });
        },
        // profile.echo
        function(){
            return root.exec('/user/profile', 'echo')
                .then(function(result){
                    test.deepEqual(result, {
                        path: '/user/profile',
                        verb: 'echo',
                        args: {},
                        path_arr: ['/user', '/profile'],
                        field: 'rupm'
                    });
                });
        },
        // news.echo
        function(){
            return root.exec('/news', 'echo')
                .then(function(result){
                    test.deepEqual(result, 'response from news mw');
                });
        },
        // method_execcount
        function(){
            test.strictEqual(method_execcount, 3);
        }
    ].reduce(Q.when, Q(1))
        .catch(function(err){ test.ok(false, err.stack); })
        .finally(test.done)
        .done();
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
