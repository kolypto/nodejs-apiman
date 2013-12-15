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

/** Test non-promised methods
 * @param {test|assert} test
 */
exports.testNonPromisedMethod = function(test){
    var root = new apiman.Root();

    root.method('test', function(req, res){
        // This method does not return a promise
        setTimeout(function(){
            res.ok('finished');
        }, 10);
    });

    return root.exec('', 'test')
        .then(function(result){
            test.ok(false, 'The method shall not succeed');
        })
        .catch(function(err){
            test.ok(err instanceof apiman.errors.MethodError);
        })
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
        return Q().delay(10)
            .then(function(){
                req.field = 'r';
            });
    });

    user.use(function(req, res){
        return Q().delay(1)
            .then(function(){
                req.field += 'u';
            });
    });

    profile.use(function(req, res){
        return Q().delay(5)
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
    // Structure
    var root = new apiman.Root(),
        user = root.resource('/user')
        ;

    // Methods
    user.method('mw', function(req, res){
        return Q().delay(10)
            .then(function(){
                throw new Error('Middleware runtime error');
            });
    }, function(req, res){});

    user.method('method', function(req, res){
        return Q().delay(10)
            .then(function(){
                throw new Error('Method runtime error');
            });
    });

    user.method('empty', function(req, res){
        // no response sent
        return Q().delay(10);
    });

    user.method('err', function(req, res){
        // no response sent
        return Q().delay(10)
            .then(function(){
                res.error('method error');
            });
    });

    // Test
    [
        // Resource not found
        function(){
            return root.exec('/nores', 'nomethod')
                .then(function(){ test.ok(false); })
                .catch(function(error){
                    test.ok(error instanceof apiman.errors.NotFound);
                    test.ok(error.system === true);
                    test.strictEqual(error.message, 'Not found: "/nores:nomethod"');
                });
        },
        // Method not found
        function(){
            return root.exec('/user', 'nomethod')
                .then(function(){ test.ok(false); })
                .catch(function(error){
                    test.ok(error instanceof apiman.errors.NotFound);
                    test.ok(error.system === true);
                    test.strictEqual(error.message, 'Not found: "/user:nomethod"');
                });
        },
        // Middleware runtime error
        function(){
            return root.exec('/user', 'mw')
                .then(function(){ test.ok(false); })
                .catch(function(error){
                    test.ok(error instanceof apiman.errors.MethodError);
                    test.ok(error.system === true);
                    test.strictEqual(error.message, 'Method error on "/user:mw": Error: Middleware runtime error');
                });
        },
        // Method runtime error
        function(){
            return root.exec('/user', 'method')
                .then(function(){ test.ok(false); })
                .catch(function(error){
                    test.ok(error instanceof apiman.errors.MethodError);
                    test.ok(error.system === true);
                    test.strictEqual(error.message, 'Method error on "/user:method": Error: Method runtime error');
                });
        },
        // No response sent
        function(){
            return root.exec('/user', 'empty')
                .then(function(){ test.ok(false); })
                .catch(function(error){
                    test.ok(error instanceof apiman.errors.MethodError);
                    test.ok(error.system === true);
                    test.strictEqual(error.message, 'Method error on "/user:empty": No response sent');
                });
        },
        // Method error
        function(){
            return root.exec('/user', 'err')
                .then(function(){ test.ok(false); })
                .catch(function(error){
                    test.strictEqual(error, 'method error');
                });
        }
    ].reduce(Q.when, Q(1))
        .catch(function(err){ test.ok(false, err.stack); })
        .finally(test.done)
        .done();
};

/** Endpoint Resource
 * @param {test|assert} test
 */
exports.testResourceEndpoint = function(test){
    // Resources
    var root = new apiman.Root(),
        user = root.resource('/user'),
        upload = root.resource('/upload')
        ;

    // Method
    user.method('load', function(req, res){ res.ok(); });
    upload.endpointMethod(function(req, res){
        res.ok({
            path_tail: req.path_tail,
            verb: req.verb
        });
    });

    // Test
    [
        // user.load
        function(){
            root.exec('/user', 'load')
                .then(function(result){
                    test.strictEqual(result, undefined);
                });
        },
        // upload.load
        function(){
            root.exec('/upload/a/b/c', 'loadAnything')
                .then(function(result){
                    test.deepEqual(result, {
                        path_tail: '/a/b/c',
                        verb: 'loadAnything'
                    });
                });
        },
    ].reduce(Q.when, Q(1))
        .catch(function(err){ test.ok(false, err.stack); })
        .finally(test.done)
        .done();
};

/** Controller Resource
 * @param {test|assert} test
 */
exports.testResourceController = function(test){
    // Resources
    var root = new apiman.Root(),
        user = root.resource('/user')
        ;

    // Methods
    var UserCtrl = function(something){
        this.something = something;
    };

    UserCtrl.prototype.get = function(req, res){
        res.ok({
            something: this.something,
            mw_worked: req.mw_worked,
            login: 'kolypto'
        });
    };
    UserCtrl.prototype.get.middleware = [
        function(req, res){
            req.mw_worked = 'yesss!';
        }
    ];

    UserCtrl.prototype.set = function(req, res){
        res.ok({ ok: true });
    };

    UserCtrl.prototype._private = function(){};

    user.controllerMethods(new UserCtrl('anything'));

    // Test
    [
        // Structure
        function(){
            test.deepEqual(_.keys(user.methods), ['get','set']);
        },
        // user.get
        function(){
            return root.exec('/user', 'get')
                .then(function(result){
                    test.deepEqual(result, {
                        something: 'anything',
                        mw_worked: 'yesss!',
                        login: 'kolypto'
                    });
                });
        },
        // user.set
        function(){
            return root.exec('/user', 'set')
                .then(function(result){
                    test.deepEqual(result, {
                        ok: true
                    });
                });
        },
    ].reduce(Q.when, Q(1))
        .catch(function(err){ test.ok(false, err.stack); })
        .finally(test.done)
        .done();
};
