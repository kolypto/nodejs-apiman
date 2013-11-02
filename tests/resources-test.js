'use strict';

var vows = require('vows'),
    assert = require('assert'),
    apiman = require('..'),
    Resource = require('../lib/structure/Resource'),
    Method = require('../lib/structure/Method'),
    connect = require('connect')
    ;

vows.describe('ApiMan')
    // resource(), method(), param(), which(), query()
    .addBatch({
        'given an API,': {
            // Define the structure for all further tests
            topic: function(){
                var root = new apiman.Root();

                // A root method that lists resources
                root.method('list', function(req, res){
                    res.send(undefined, Object.keys(root.resources));
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
                    .param(1, function(req, res, next, val){
                        req.params['device'] = val.toUpperCase();
                        next();
                    });
                var user_device_commands = user_devices.resource(new RegExp('^/command/(\\w+)/(\\w+)/(\\w+)'))
                    .param(1, function(req, res, next, val){ // Functional param
                        if (['start', 'stop'].indexOf(val) == -1)
                            next('unknown command');
                        else {
                            req.params['command'] = val;
                            next();
                        }
                    })
                    .param(2) // Indexed param
                    .param(3, 'name') // Named param
                    ;

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
                        return root.which('/user/device/cellphone/command/call/abc/def', 'exec') || null;
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
                        root.request('', 'list', {}, this.callback);
                    },
                    'returns list of resources': function(err, result){
                        assert.equal(err, undefined);
                        assert.deepEqual(result, ['/user']);
                    }
                },
                // Check the `request` param fields
                'req /': {
                    topic: function(root){
                        root.request('', 'req', {a:1}, this.callback);
                    },
                    'returns a valid request object': function(err, req){
                        assert.equal(err, undefined);
                        assert.equal(req.path, '');
                        assert.deepEqual(req.path_arr, []);
                        assert.equal(req.verb, 'req');
                        assert.deepEqual(req.args, {a:1});
                    }
                },
                // Invoking a callback
                'set /user': {
                    topic: function(root){
                        root.request('/user', 'set', {a:1}, this.callback);
                    },
                    'saved ok': function(err, result){
                        assert.equal(err, undefined);
                        assert.deepEqual(result, {ok: true});
                    }
                },
                // Invoking a callback with error
                'get /user,': {
                    'uid not found': {
                        topic: function(root){
                            root.request('/user', 'get', {uid: 99}, this.callback);
                        },
                        'err: not found': function(err, result){
                            assert.equal(err.message, 'uid not found');
                            assert.equal(result, undefined);
                        }
                    },
                    'uid found': {
                        topic: function(root){
                            root.request('/user', 'get', {uid: 10}, this.callback);
                        },
                        'returns the user': function(err, result){
                            assert.equal(err, undefined);
                            assert.deepEqual(result, {uid: 10, name: 'user'});
                        }
                    }
                },
                // Another method here
                'del /user': {
                    topic: function(root){
                        root.request('/user', 'del', {uid: 10}, this.callback);
                    },
                    'user deleted': function(err, result){
                        assert.equal(err, undefined);
                        assert.deepEqual(result, {ok: true});
                    }
                },
                // Middleware that produces errors
                'middleware': {
                    // 1st middleware can deny the access
                    'first: access denied': {
                        topic: function(root){
                            root.request('/user', 'mw', {uid: 11, name: 'wrong'}, this.callback);
                        },
                        'middleware rejected': function(err, result){
                            assert.equal(err, 'access denied');
                            assert.equal(result, undefined);
                        }
                    },
                    // 2nd middleware provides more checks
                    'second: invalid username': {
                        topic: function(root){
                            root.request('/user', 'mw', {uid: 10, name: 'wrong'}, this.callback);
                        },
                        'middleware rejected': function(err, result){
                            assert.equal(err, 'invalid username');
                            assert.equal(result, undefined);
                        }
                    },
                    // All checks fine - the method works ok
                    'the method: ok': {
                        topic: function(root){
                            root.request('/user', 'mw', {uid: 10, name: 'user'}, this.callback);
                        },
                        'middleware allowed': function(err, result){
                            assert.equal(err, undefined);
                            assert.deepEqual(result, {ok: true});
                        }
                    }
                },
                // Try to invoke some method on an empty resource
                '/empty': {
                    topic: function(root){
                        return root.request('/empty', '', {}, this.callback) || 'not found';
                    },
                    'method not found': function(method){
                        assert.equal(method, 'not found');
                    }
                },
                // Check the `request` object on a sub-resource
                '/user/profile': {
                    'req()': {
                        topic: function(root){
                            root.request('/user/profile', 'req', {a:1}, this.callback);
                        },
                        'returns a valid request object': function(err, req){
                            assert.equal(err, undefined);
                            assert.equal(req.path, '/user/profile'); // path
                            assert.deepEqual(req.path_arr, ['/user', '/profile']); // path array
                            assert.equal(req.verb, 'req'); // verb ok
                            assert.deepEqual(req.args, {a:1});
                        }
                    }
                },
                // Check parameters
                '/user/device/:device/command/:command/:2/:name': {
                    // Correct call
                    ':device=mixer, :command=start, :2=abc, :name=def': {
                        topic: function(root){
                            root.request('/user/device/mixer/command/start/abc/def', 'exec', {a:1}, this.callback);
                        },
                        'request ok': function(err, req){
                            assert.equal(err, undefined);
                            assert.equal(req.path, '/user/device/mixer/command/start/abc/def');
                            assert.deepEqual(req.path_arr, ['/user', '/device/mixer', '/command/start/abc/def']);
                            assert.equal(req.verb, 'exec');
                            assert.deepEqual(req.args, {a:1});
                            assert.deepEqual(req.params, { device: 'MIXER', command: 'start', 2: 'abc', name: 'def' });
                        }
                    },
                    // Parameter function produces an error
                    ':device=mixer, :command=UNKNOWN': {
                        topic: function(root){
                            root.request('/user/device/mixer/command/UNKNOWN/a/b', 'exec', {a:1}, this.callback);
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
    // merge()
    .addBatch({
        'merging resources': {
            topic: function(){
                var root = new apiman.Root;

                // A module designed to extend the root
                var module = new apiman.Root;
                var user = module.resource('/user');
                user.method('ok', function(req, res){ res.ok('ok user'); });

                var device = module.resource('/device');
                device.method('ok', function(req, res){ res.ok('ok device'); });

                // An extension that merges everything recursively
                var extension = new apiman.Root;
                extension.resource('/user')
                    .method('hello', function(req, res){ res.ok('hello user') });

                root.merge(module, extension);
                return root;
            },
            // Check that all methods are there
            'method lookup': {
                topic: function(root){
                    return [
                        root.which('/user', 'ok'),
                        root.which('/user', 'hello'),
                        root.which('/device', 'ok')
                    ];
                },
                'found': function(methods){
                    assert.notEqual(methods[0], undefined);
                    assert.notEqual(methods[1], undefined);
                }
            },
            // module was merged
            'call user:ok': {
                topic: function(root){
                    root.request('/user', 'ok', {}, this.callback);
                },
                'called ok': function(err, result){
                    assert.equal(err, undefined);
                    assert.equal(result, 'ok user');
                }
            },
            // extension was merged
            'call user:hello': {
                topic: function(root){
                    root.request('/user', 'hello', {}, this.callback);
                },
                'called ok': function(err, result){
                    assert.equal(err, undefined);
                    assert.equal(result, 'hello user');
                }
            },
            // second resource from the module was merged
            'call device:ok': {
                topic: function(root){
                    root.request('/device', 'ok', {}, this.callback);
                },
                'called ok': function(err, result){
                    assert.equal(err, undefined);
                    assert.equal(result, 'ok device');
                }
            }
        }
    })
    // Mappers
    .addBatch({
        'on an API with defined mappers,': {
            topic: function(){
                var root = new apiman.Root();

                var user = root.resource('/user');
                user.method('save', function(req, res){ res.ok('saved'); });
                user.method(['load', 'del'], function(req, res){ res.ok({'load': 'loaded', 'del': 'deleted'}[req.verb]); });
                user.method('block', function(req, res){ res.ok('blocked'); });
                user.method('list', function(req, res){ res.ok('listed'); });
                user.map('express', {
                    '': ['', {GET: 'load', POST: 'save', DELETE: 'del'}],
                    '/block': ['', 'block'],
                    '/list': ['', 'list']
                });

                var profile = user.resource('/profile');
                profile.method('peek', function(req, res){ res.ok('o_O'); });
                profile.method('steal', function(req, res){ res.ok('stolen'); });
                profile.map('express', function(path, verb){
                    return ['',
                            {'/peek': 'peek', '/steal': 'steal'}[path]
                    ];
                });

                // Mapping with RegExps: two ways
                var device = root.resource('/device')
                    // First way
                    .resource('/command')
                        .resource('/list')
                            .method('list', function(req, res){ res.ok('list'); })
                            .map('express', {
                                '': ['', {GET: 'list'}]
                            })
                            .parent
                        .resource(new RegExp('^/(\\w+)'))
                            .param(1, 'name')
                            .method('exec', function(req, res){ res.ok('exec:'+req.params.name); })
                            .map('express', {
                                '': ['', {GET: 'exec'}]
                            })
                            .parent
                        .parent
                    // Second way
                    .resource(new RegExp('^/message/(\\w+)'))
                        .param(1, 'name')
                        .method('list', function(req, res){ res.ok('list'); })
                        .method('get', function(req, res){ res.ok('get:'+req.params.name); })
                        // Override mappings
                        .map('express', function(path, verb, match){
                            return {
                                'GET /message/list': ['', 'list']
                            }[verb + ' ' + match] || {
                                GET: ['', 'get']
                            }[verb];
                        })
                        .parent


                return root;
            },
            // Mapped method
            'GET /user': {
                topic: function(root){
                    root.requestFrom('express', '/user', 'GET', {}, this.callback)
                        || this.callback('MNF');
                },
                'mapped & called': function(err, result){
                    assert.equal(err, undefined);
                    assert.equal(result, 'loaded');
                }
            },
            // Mapped method
            'POST /user': {
                topic: function(root){
                    root.requestFrom('express', '/user', 'POST', {}, this.callback)
                        || this.callback('MNF');
                },
                'mapped & called': function(err, result){
                    assert.equal(err, undefined);
                    assert.equal(result, 'saved');
                }
            },
            // Mapped method
            'DELETE /user': {
                topic: function(root){
                    root.requestFrom('express', '/user', 'DELETE', {}, this.callback)
                        || this.callback('MNF');
                },
                'mapped & called': function(err, result){
                    assert.equal(err, undefined);
                    assert.equal(result, 'deleted');
                }
            },
            // Unknown verb
            'UNKNOWN /user': {
                topic: function(root){
                    return root.requestFrom('express', '/user', 'PUT', {}, function(){}) || 'MNF';
                },
                'unknown method': function(ok){
                    assert.equal(ok, 'MNF');
                }
            },
            // unknown resource
            'GET /userGG': {
                topic: function(root){
                    return root.requestFrom('express', '/user', 'PUT', {}, this.callback) || 'MNF';
                },
                'unknown resoure': function(ok){
                    assert.equal(ok, 'MNF');
                }
            },
            // Method mapped to a sub-resource
            'GET /user/block': {
                topic: function(root){
                    root.requestFrom('express', '/user/block', 'GET', {}, this.callback)
                        || this.callback('MNF');
                },
                'mapped & called': function(err, result){
                    assert.equal(err, undefined);
                    assert.equal(result, 'blocked');
                }
            },
            // Method mapped to a sub-resource
            'GET /user/list': {
                topic: function(root){
                    root.requestFrom('express', '/user/list', 'GET', {}, this.callback)
                        || this.callback('MNF');
                },
                'mapped & called': function(err, result){
                    assert.equal(err, undefined);
                    assert.equal(result, 'listed');
                }
            },
            // Sub-resource's mapped method
            'GET /user/profile/peek': {
                topic: function(root){
                    root.requestFrom('express', '/user/profile/peek', 'GET', {}, this.callback)
                        || this.callback('MNF');
                },
                'mapped & called': function(err, result){
                    assert.equal(err, undefined);
                    assert.equal(result, 'o_O');
                }
            },
            // Sub-resource's mapped method
            'GET /user/profile/steal': {
                topic: function(root){
                    root.requestFrom('express', '/user/profile/steal', 'GET', {}, this.callback)
                        || this.callback('MNF');
                },
                'mapped & called': function(err, result){
                    assert.equal(err, undefined);
                    assert.equal(result, 'stolen');
                }
            },
            // Regexp-based method
            'GET /device/command/sms': {
                topic: function(root){
                    root.requestFrom('express', '/device/command/sms', 'GET', {}, this.callback)
                        || this.callback('MNF');
                },
                'mapped & called': function(err, result){
                    assert.equal(err, undefined);
                    assert.equal(result, 'exec:sms');
                }
            },
            'GET /device/command/list': {
                topic: function(root){
                    root.requestFrom('express', '/device/command/list', 'GET', {}, this.callback)
                        || this.callback('MNF');
                },
                'mapped & called': function(err, result){
                    assert.equal(err, undefined);
                    assert.equal(result, 'list');
                }
            },
            // Regexp-based method
            'GET /device/message/10': {
                topic: function(root){
                    root.requestFrom('express', '/device/message/10', 'GET', {}, this.callback)
                        || this.callback('MNF');
                },
                'mapped & called': function(err, result){
                    assert.equal(err, undefined);
                    assert.equal(result, 'get:10');
                }
            },
            'GET /device/message/list': {
                topic: function(root){
                    root.requestFrom('express', '/device/message/list', 'GET', {}, this.callback)
                        || this.callback('MNF');
                },
                'mapped & called': function(err, result){
                    assert.equal(err, undefined);
                    assert.equal(result, 'list');
                }
            }
        }
    })

    // Events
    .addBatch({
        'given an API': {
            topic: function(){
                var root = new apiman.Root;

                root.use(function(req, res, next){
                    req.root_mw_worked = true;
                    req.session = {};

                    // Before calling the method
                    req.on('method', function(method){
                        req.session.method = method.toString();
                    });

                    // After calling the method
                    req.on('done', function(err, data){
                        req.session.done = [err, data];
                    });

                    next();
                });

                var user = root.resource('/user');
                user.use(function(req, res, next){
                    req.user_mw_worked = true;
                    next();
                });

                user.method('get',
                    function(req, res, next){
                        req.method_mw_worked = true;
                        next();
                    },
                    function(req, res){
                        req.method_called = true;
                        res.ok(req);
                    }
                );

                return root;
            },

            'call /user:get': {
                topic: function(root){
                    root.request('/user', 'get', {a:1}, this.callback);
                },
                'middleware worked': function(err, req){
                    assert.equal(err, undefined);

                    assert.equal(req.method_called, true); // method was called
                    assert.equal(req.root_mw_worked, true); // root resource mw worked
                    assert.equal(req.user_mw_worked, true); // user resource mw worked
                    assert.equal(req.method_mw_worked, true); // method mw worked

                    assert.equal(req.session.method, 'get /user');
                    assert.equal(req.session.done[0], undefined);
                    assert.equal(req.session.done[1].path, '/user');
                }
            }
        }
    })
    // Middleware
    .addBatch({
        'session middleware':{
            topic: function(){
                var root = new apiman.Root;

                root.use(apiman.middleware.session({
                    store: new connect.session.MemoryStore
                }));

                root.method('get', function(req, res){
                    res.ok({ ok:1 });
                });
                root.method('set', function(req, res){
                    req.session[req.args.name] = req.args.val;
                    res.ok({ ok:1 });
                });

                return root;
            },

            'creation test': {
                topic: function(root){
                    var self = this;

                    root.request('', 'get', {}, this.callback);
                },

                'session data created': function(err, result, req){
                    assert.equal(err, undefined);
                    assert.deepEqual(result, { ok:1 });
                    assert.ok(req.sessionID !== undefined);
                    assert.ok(req.session !== undefined);
                }
            },

            'persistence test': {
                topic: function(root){
                    var self = this;

                    var sessionID;

                    /** Call the '':'set' method with a delay so the session storage backend has a change to save the session data
                     * @param args
                     * @param callback
                     */
                    var callDelayed = function(args, callback){
                        setTimeout(function(){
                            root.request('', 'set', args, {sessionID: sessionID}, function(err, result, req){
                                sessionID = req.sessionID;
                                callback.apply(this, arguments);
                            });
                        }, 100);
                    }

                    callDelayed({ name: 'first', val: 1 }, function(err, result, req){
                        callDelayed({ name: 'second', val: 2 }, function(err, result, req){
                            callDelayed({ name: 'third', val: 3 }, self.callback);
                        });
                    });
                },

                'session data created': function(err, result, req){
                    assert.equal(err, undefined);
                    assert.deepEqual(result, { ok:1 });
                    assert.ok(req.sessionID !== undefined);
                    assert.ok(req.session !== undefined);
                    assert.deepEqual({
                        first: req.session.first,
                        second: req.session.second,
                        third: req.session.third
                    }, {
                        first: 1,
                        second: 2,
                        third: 3
                    });
                }
            }
        }
    })
    .export(module);
