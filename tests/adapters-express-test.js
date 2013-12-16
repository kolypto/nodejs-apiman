'use strict';

var express = require('express'),
    connect = require('connect'),
    http = require('http'),
    Q = require('q'),
    _ = require('lodash'),
    apiman = require('../'),
    u = require('./util')
    ;

/** Test exports.express
 * @param {test|assert} test
 */
exports.testExpressMiddleware = function(test){
    // ApiMan
    var root = new apiman.Root(),
        login = root.resource('/login'),
        user = root.resource('/user')
        ;

    // Session middleware
    root.use(apiman.middleware.session());

    // Users DB
    var users = {
        'admin': { name: 'root', pass: '1234', admin: true },
        'kolypto': { name: 'Mark', pass: '1234', admin: false },
        'carrie': { name: 'Carrie', age: 18, size: 'B' }
    };

    /** /login:login
     * Sign the user in
     */
    login.method('login', function(req, res){
        var user = users[req.args.login];

        if (user && user.pass === req.args.pass){
            req.session.user = _.omit(user, 'pass');
            res.ok({ ok: 1 });
        } else
            res.error('Invalid credentials');
    });

    /** /login:whoami
     * Tell who am i
     */
    login.method('whoami', function(req, res){
        res.ok({ user: req.session.user });
    });

    /** Authorization middleware that rejects unauthorized users
     * @param {Boolean} adminRequired
     *      Is the admin access required?
     * @returns {Function}
     */
    var authorization = function(adminRequired){
        return function(req, res){
            if (!req.session.user)
                res.error('Not signed in');

            if (!adminRequired)
                return;

            if (!req.session.user.admin)
                res.error('Unauthorized');
        };
    };

    /** /user:get
     * Fetch a user
     * Only available to authenticated users
     */
    user.method('get', authorization(false), function(req, res){
        if (!users[req.args.login])
            return res.error('User not found');
        res.ok({ user: _.omit(users[req.args.login], 'pass') });
    });

    /** /user:del
     * Delete a user
     * Only available to admins
     */
    user.method('del', authorization(true), function(req, res){
        if (!users[req.args.login])
            return res.error('User not found');
        delete users[req.args.login];
        res.ok({ ok: 1 });
    });

    // Expose to Express
    var app = express();
    app.use(express.cookieParser()); // enable cookies
    app.use(express.bodyParser()); // enable JSON
    app.use('/api', apiman.adapters.express(root));

    // Listen
    var httpServer = http.createServer(app),
        api,
        startListening = function(){
            var d = Q.defer();

            httpServer.on('listening', function(){
                var port = httpServer.address().port;
                api = new u.ApiClient('http://localhost:' + port + '/api');
                d.resolve();
            });

            httpServer.on('error', function(e){
                d.reject(e);
            });

            httpServer.listen(0, 'localhost');

            return d.promise;
        },
        stopListening = function(){
            return Q.nmcall(httpServer, 'close');
        }
        ;

    // Test
    [
        startListening,
        // No method error
        function(){
            return api.call('/no-resource', 'nomethod')
                .then(function(){
                    test.ok(false, arguments);
                })
                .catch(function(e){
                    test.deepEqual(e, {
                        error: {
                            path: '/no-resource',
                            method: 'nomethod',
                            message: 'Not found: "/no-resource:nomethod"',
                            system: true
                        }
                    });
                });
        },
        // /login:login: fail
        function(){
            return api.call('/login', 'login', {})
                .then(function(){
                    test.ok(false, arguments);
                })
                .catch(function(e){
                    test.deepEqual(e, {
                        error: {
                            message: 'Invalid credentials',
                            system: false
                        }
                    });
                });
        },
        // /login:login: kolypto
        function(){
            return api.call('/login', 'login', { login: 'kolypto', pass: '1234' })
                .then(function(result){
                    test.deepEqual(result, { ok: 1 });
                });
        },
        // /login:whoami
        function(){
            return api.call('/login', 'whoami')
                .then(function(result){
                    test.deepEqual(result, { user: { name: 'Mark', admin: false } });
                });
        },
        // /user:get
        function(){
            return api.call('/user', 'get', { login: 'carrie' })
                .then(function(result){
                    test.deepEqual(result, { user: { name: 'Carrie', age: 18, size: 'B' } });
                });
        },
        // /user:del -> unauthorized
        function(){
            return api.call('/user', 'del', { login: 'carrie' })
                .then(function(){
                    test.ok(false, arguments);
                })
                .catch(function(e){
                    test.deepEqual(e, {
                        error: {
                            message: 'Unauthorized',
                            system: false
                        }
                    });
                });
        },
        // /login:login: admin
        function(){
            return api.call('/login', 'login', { login: 'admin', pass: '1234' })
                .then(function(result){
                    test.deepEqual(result, { ok: 1 });
                });
        },
        // ///user:del
        function(){
            return api.call('///user', 'del', { login: 'carrie' })
                .then(function(result){
                    test.deepEqual(result, { ok: 1 });
                });
        },
    ].reduce(Q.when, Q())
        .catch(function(err){ test.ok(false, err.stack || err); })
        .finally(stopListening)
        .finally(function(){ test.done(); })
        .done();
};
