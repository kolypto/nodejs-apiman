'use strict';

var vows = require('vows'),
    assert = require('assert'),
    apiman = require('..'),
    Resource = require('../lib/structure/Resource'),
    Method = require('../lib/structure/Method')
    ;

vows.describe('ApiMan')
    .addBatch({
        'given an API,': {
            // Define the structure for all further tests
            topic: function(){
                var root = new apiman.Root();

                // A root method that lists resources
                root.method('list', function(req, res){
                    res.send(undefined, Object.keys(req.resource.resources));
                });

                // A root method that dumps the Request object
                root.method('req', function(req, res){
                    res.ok(req);
                });

                // Top resource
                var user = root.resource('/user');

                // Simple method
                user.method('set', function(req, res){
                    setTimeout(function(){
                        res.ok({ok: true}); // respond
                    }, 100);
                });

                // Two verbs for one method
                user.method(['get', 'del'], function(req, res){
                    if (req.args.uid != 10)
                        res.error(new Error('uid not found')); // Throw errors asynchronously
                    else {
                        if (req.verb == 'del')
                            res.ok({ok: true}); // del
                        else
                            res.ok({uid: req.args.uid, name: 'user'}); // get
                    }
                });

                // Middleware method
                user.method('mw', function(req, res, next){
                    if (req.args.uid != 10)
                        next('access denied'); // error
                    else
                        next();
                },
                function(req, res, next){
                    if (req.args.name != 'user')
                        res.error('invalid username'); // also error
                    else
                        next();
                },
                function(req, res){
                    res.ok({ok: true});
                });

                // Subresource with no methods
                user.resource('/empty');

                // Subresource with methods
                var user_profile = user.resource('/profile');
                user_profile.method(['get', 'del'], function(req, res){
                    if (req.verb == 'get')
                        res.ok({profile: {}});
                    else
                        res.ok({deleted: true});
                });
                user_profile.method('req', function(req, res){
                    res.ok(req);
                });

                // Subresource with params
                var user_devices = user.resource(new RegExp('^/device/(\\w+)'))
                    .param(1, 'device', function(req, res, next, val){
                        req.params['device'] = val.toUpperCase();
                        next();
                    });
                var user_device_commands = user_devices.resource(new RegExp('^/command/(\\w+)'))
                    .param(1, 'command', function(req, res, next, val){
                        if (['start', 'stop'].indexOf(val) == -1)
                            next('unknown command');
                        else {
                            req.params['command'] = val;
                            next();
                        }
                    });

                user_device_commands.method('exec', function(req, res){
                    res.ok(req);
                });

                return root;
            },
            'lookup': {
                // Lookup methods in the root Resource: path=''
                'root methods': {
                    topic: function(root){
                        return [
                            root.which('', 'list'),
                            root.which('', 'not-found')
                        ];
                    },
                    'found': function(list){
                        // method 'list'
                        assert.ok(list[0]);
                        assert.deepEqual(list[0].verbs, ['list']);
                        // method not found
                        assert.equal(list[1], undefined);
                    }
                },
                // Lookup methods in a sub-resource
                'level 1': {
                    topic: function(root){
                        return [
                            root.which('/user', 'set'),
                            root.which('/user', 'del')
                        ];
                    },
                    'found': function(list){
                        // Methods found
                        assert.ok(list[0]);
                        assert.ok(list[1]);
                        // Methods found correctly
                        assert.deepEqual(list[0].verbs, ['set']);
                        assert.deepEqual(list[1].verbs, ['get', 'del']);
                    }
                },
                // Lookup methods in a sub-sub-resource
                'level 2': {
                    topic: function(root){
                        return root.which('/user/profile', 'get') || null;
                    },
                    'found': function(method){
                        // found correctly
                        assert.ok(method);
                        assert.deepEqual(method.verbs, ['get', 'del']);
                    }
                },
                // Lookup methods with params (given as regexp)
                'level 4 with params': {
                    topic: function(root){
                        return root.which('/user/device/cellphone/command/call', 'exec') || null;
                    },
                    'found': function(method){
                        // Found ok
                        assert.notEqual(method, null);
                        assert.deepEqual(method.verbs, ['exec']);
                    }
                },
                // Lookup methods that don't exist
                'missing': {
                    topic: function(root){
                        return [
                            // Lookup a missing resource
                            root.which('/user/don-t-exist', 'get'),
                            // Lookup a missing verb
                            root.which('/user', 'don-t-exist')
                        ];
                    },
                    'not found': function(methods){
                        assert.deepEqual(methods, [undefined, undefined]);
                    }
                }
            },
            'request:': {
                // Exec top-level method
                'list /': {
                    topic: function(root){
                        root.exec('', 'list', {}, this.callback);
                    },
                    'returns list of resources': function(err, result){
                        assert.ok(!err);
                        assert.deepEqual(result, ['/user']);
                    }
                },
                // Check the `request` param fields
                'req /': {
                    topic: function(root){
                        root.exec('', 'req', {a:1}, this.callback);
                    },
                    'returns a valid request object': function(err, req){
                        assert.ok(!err);
                        assert.equal(req.path, '');
                        assert.deepEqual(req.path_arr, []);
                        assert.equal(req.verb, 'req');
                        assert.deepEqual(req.args, {a:1});
                        assert.deepEqual(Object.keys(req.target.resources), ['/user']); // `target` property
                        assert.deepEqual(Object.keys(req.resource.resources), ['/user']); // `resource` property
                        assert.deepEqual(req.method.verbs, ['req']); // `method` property
                    }
                },
                // Invoking a callback
                'set /user': {
                    topic: function(root){
                        root.exec('/user', 'set', {a:1}, this.callback);
                    },
                    'saved ok': function(err, result){
                        assert.ok(!err);
                        assert.deepEqual(result, {ok: true});
                    }
                },
                // Invoking a callback with error
                'get /user,': {
                    'uid not found': {
                        topic: function(root){
                            root.exec('/user', 'get', {uid: 99}, this.callback);
                        },
                        'err: not found': function(err, result){
                            assert.equal(err.message, 'uid not found');
                            assert.equal(result, undefined);
                        }
                    },
                    'uid found': {
                        topic: function(root){
                            root.exec('/user', 'get', {uid: 10}, this.callback);
                        },
                        'returns the user': function(err, result){
                            assert.ok(!err);
                            assert.deepEqual(result, {uid: 10, name: 'user'});
                        }
                    }
                },
                // Another method here
                'del /user': {
                    topic: function(root){
                        root.exec('/user', 'del', {uid: 10}, this.callback);
                    },
                    'user deleted': function(err, result){
                        assert.ok(!err);
                        assert.deepEqual(result, {ok: true});
                    }
                },
                // Middleware that produces errors
                'middleware': {
                    // 1st middleware can deny the access
                    'first: access denied': {
                        topic: function(root){
                            root.exec('/user', 'mw', {uid: 11, name: 'wrong'}, this.callback);
                        },
                        'middleware rejected': function(err, result){
                            assert.equal(err, 'access denied');
                            assert.equal(result, undefined);
                        }
                    },
                    // 2nd middleware provides more checks
                    'second: invalid username': {
                        topic: function(root){
                            root.exec('/user', 'mw', {uid: 10, name: 'wrong'}, this.callback);
                        },
                        'middleware rejected': function(err, result){
                            assert.equal(err, 'invalid username');
                            assert.equal(result, undefined);
                        }
                    },
                    // All checks fine - the method works ok
                    'the method: ok': {
                        topic: function(root){
                            root.exec('/user', 'mw', {uid: 10, name: 'user'}, this.callback);
                        },
                        'middleware allowed': function(err, result){
                            assert.ok(!err);
                            assert.deepEqual(result, {ok: true});
                        }
                    }
                },
                // Try to invoke some method on an empty resource
                '/empty': {
                    topic: function(root){
                        return root.exec('/empty', '', {}, this.callback) || 'not found';
                    },
                    'method not found': function(method){
                        assert.equal(method, 'not found');
                    }
                },
                // Check the `request` object on a sub-resource
                '/user/profile': {
                    'req()': {
                        topic: function(root){
                            root.exec('/user/profile', 'req', {a:1}, this.callback);
                        },
                        'returns a valid request object': function(err, req){
                            assert.ok(!err);
                            assert.equal(req.path, '/user/profile'); // path
                            assert.deepEqual(req.path_arr, ['/user', '/profile']); // path array
                            assert.equal(req.verb, 'req'); // verb ok
                            assert.deepEqual(req.args, {a:1});
                            assert.deepEqual(Object.keys(req.target.resources), ['/user']);
                            assert.deepEqual(Object.keys(req.resource.resources), []);
                            assert.deepEqual(req.method.verbs, ['req']);
                        }
                    }
                },
                // Check parameters
                '/user/device/:device/command/:command': {
                    // Correct call
                    ':device=mixer, :command=start': {
                        topic: function(root){
                            root.exec('/user/device/mixer/command/start', 'exec', {a:1}, this.callback);
                        },
                        'request ok': function(err, req){
                            assert.ok(!err);
                            assert.equal(req.path, '/user/device/mixer/command/start');
                            assert.deepEqual(req.path_arr, ['/user', '/device/mixer', '/command/start']);
                            assert.equal(req.verb, 'exec');
                            assert.deepEqual(req.args, {a:1});
                            assert.deepEqual(req.params, { device: 'MIXER', command: 'start' });
                        }
                    },
                    // Parameter function produces an error
                    ':device=mixer, :command=UNKNOWN': {
                        topic: function(root){
                            root.exec('/user/device/mixer/command/UNKNOWN', 'exec', {a:1}, this.callback);
                        },
                        'request ok': function(err, req){
                            assert.equal(err, 'unknown command');
                            assert.equal(req, undefined);
                        }
                    }
                }
            }
        }
    })
    .export(module);
