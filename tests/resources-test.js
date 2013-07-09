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

                // Subresource with params
                var user_device_commands = user.resource('/device/:device/command');
    //            user_device_commands.param(':device', function(req, res, next, id){}); // TODO: params
                user_device_commands.method('do', function(req, res){
                    res.ok({ params: req.params, args: req.args });
                });

                return root;
            },
            'lookup': {
                'root methods': {
                    topic: function(root){
                        return [
                            root.which('', 'list'),
                            root.which('', 'not-found')
                        ];
                    },
                    'found': function(list){
                        assert.ok(list[0]);
                        assert.deepEqual(list[0].verbs, ['list']);
                        assert.equal(list[1], undefined);
                    }
                },
                'level 1': {
                    topic: function(root){
                        return [
                            root.which('/user', 'set'),
                            root.which('/user', 'del')
                        ];
                    },
                    'found': function(list){
                        assert.ok(list[0]);
                        assert.ok(list[1]);
                        assert.deepEqual(list[0].verbs, ['set']);
                        assert.deepEqual(list[0].resource.fullPath, '/user');
                        assert.deepEqual(list[1].verbs, ['get', 'del']);
                        assert.deepEqual(list[1].resource.fullPath, '/user');
                    }
                },
                'level 2': {
                    topic: function(root){
                        return root.which('/user/profile', 'get') || null;
                    },
                    'found': function(method){
                        assert.ok(method);
                        assert.deepEqual(method.verbs, ['get', 'set']);
                        assert.deepEqual(method.resource.fullPath, '/user/profile');
                    }
                },
                'level 4 with params': {
                    topic: function(root){
                        return root.which('/user/device/cellphone/command', 'get') || null;
                    },
                    'found': function(method){
                        assert.ok(method == null); // TODO: params support
//                        assert.deepEqual(method.verbs, ['get', 'set']);
//                        assert.deepEqual(method.resource.fullPath, '/user/profile');
                    }
                },
                'missing': {
                    topic: function(root){
                        return [
                            root.which('/user/don-t-exist', 'get'),
                            root.which('/user', 'don-t-exist')
                        ];
                    },
                    'not found': function(methods){
                        assert.deepEqual(methods, [undefined, undefined]);
                    }
                }
            },
            'request:': {
                'list /': {
                    topic: function(root){
                        root.exec('', 'list', {}, this.callback);
                    },
                    'returns list of resources': function(err, result){
                        assert.ok(!err);
                        assert.deepEqual(result, ['/user']);
                    }
                },
                'req /': {
                    topic: function(root){
                        root.exec('', 'req', {a:1}, this.callback);
                    },
                    'returns a valid request object': function(err, req){
                        assert.ok(!err);
                        assert.equal(req.path, '');
                        assert.equal(req.verb, 'req');
                        assert.deepEqual(req.args, {a:1});
                        assert.deepEqual(Object.keys(req.root.resources), ['/user']);
                        assert.deepEqual(Object.keys(req.resource.resources), ['/user']);
                        assert.deepEqual(req.method.verbs, ['req']);
                    }
                },
                'set /user': {
                    topic: function(root){
                        root.exec('/user', 'set', {a:1}, this.callback);
                    },
                    'saved ok': function(err, result){
                        assert.ok(!err);
                        assert.deepEqual(result, {ok: true});
                    }
                },
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
                'del /user': {
                    topic: function(root){
                        root.exec('/user', 'del', {uid: 10}, this.callback);
                    },
                    'user deleted': function(err, result){
                        assert.ok(!err);
                        assert.deepEqual(result, {ok: true});
                    }
                },
                'middleware': {
                    'first: access denied': {
                        topic: function(root){
                            root.exec('/user', 'mw', {uid: 11, name: 'wrong'}, this.callback);
                        },
                        'middleware rejected': function(err, result){
                            assert.equal(err, 'access denied');
                            assert.equal(result, undefined);
                        }
                    },
                    'second: invalid username': {
                        topic: function(root){
                            root.exec('/user', 'mw', {uid: 10, name: 'wrong'}, this.callback);
                        },
                        'middleware rejected': function(err, result){
                            assert.equal(err, 'invalid username');
                            assert.equal(result, undefined);
                        }
                    },
                    'third: all ok': {
                        topic: function(root){
                            root.exec('/user', 'mw', {uid: 10, name: 'user'}, this.callback);
                        },
                        'middleware allowed': function(err, result){
                            assert.ok(!err);
                            assert.deepEqual(result, {ok: true});
                        }
                    }
                },
                '/empty': {
                    topic: function(root){
                        return root.exec('/empty', '', {}, this.callback) || 'not found';
                    },
                    'method not found': function(method){
                        assert.equal(method, 'not found');
                    }
                },
                '/device/:device/command': {
                    // TODO: params
                }
            }
        }
    })
    .export(module);
