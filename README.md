ApiMan
======

ApiMan is the API methods manager that are exportable to multiple protocols, 
including REST via Express.

Core Components
===============

Resource, Root
--------------

A resource is a collection of methods and sub-resources identified by path.
It also keeps the related information: parameters info, middleware etc.

You create a sub-resource by calling the `Resource.resource(path)` method of 
a parent `Resource` or the `Root` container:

```js
var root = new apiman.Root();

var user = root.resource('/user');
var user_profile = user.resource('/profile');
```

The `Root` is actually a resource with empty path.

Although we follow the HTTP-style slash-separated paths, you're free to use any 
convention you're comfortable with.

Method
------

After you have a hierarchy of resources, you can define methods on each, 
including the root container.

A `Method` is defined with the `Resource.method(verbs, ...callbacks)` method of 
a `Resource`. 
`verbs` is the name of the method, or, optionally, an array of them.
After the `verb`, you specify a callback to be executed when the method matches
the request:

```js
user_profile.method('set', function(req, res){
    save_to_db(
        req.args['user'], 
        function(err, id){
            if (err)
                res.error(err);
            else
                res.ok({saved: true, id: id});
        }
    );
});
```

The method callback accepts two arguments: the `Request` and `Response` objects.

### Request

The `Request` object has the following useful properties:

* `req.path` is the full path to the current resource: 
    `'/user/profile'`
* `req.verb` is the current verb than made the method match: 
    `'set'`
* `req.args` is an object of method arguments: 
    `{ user: {login: 'kolypto', ...} }`
* `req.path_array` is an array of path components split on a resource match: 
    `['/user', '/profile']`
* `req.params` is an object of parameters from RegExps on path (see below).
    `{ uid: 10 }`

And also some internal informational fields:

* `req.middleware` is an array of middleware assigned to this very request.
* `req.response` is the `Response` object shortcut used internally

### Response

The `Response` object is a naive wrapper for a NodeJS-style 
`function(err,result)` callback and has the following methods:

* `Response.send(err, result)` is the generic callback with both options
* `Response.error(err)` is the callback for errors that 
    wraps `Response.send(err)`
* `Response.ok(result)` is the callback for results that 
    wraps `Response.send(undefined, result)`

Middleware
----------

### Method middleware

Like in Express, each method can use an arbitrary list of middleware callbacks
before the method function:

```js
// middleware to check the permissions
var accessCheck = function(req, res, next){
    if (req.args['uid'] != 10) // stupid access check
        next(new Error('Access denied')); // error
    else 
        next(); // proceed
};

user_profile.method('get', accessCheck, function(req, res){
    load_from_db(function(err, user){
        res.send(err, user); // delegate both arguments to the response handler
    });
});
```

Now, the method function is only executed once all preceding middleware 
callbacks have called `next()` with no arguments, which indicates success.

### Resource middleware

Additionally, a middleware can be attached to a `Resource`: it will be executed
for all requests to its methods or methods of the sub-resources:

```js
user_profile.use(function(req, res, next){
    if (req.args['uid'] === undefined)
        next(new Error('Missing required argument: uid'));
    else
        next();
});
```

Parameters
----------

Resource paths can be specified as regular expressions, just don't forget to 
anchor them to the start of the string. As RegExps can capture parts of the 
input, I could't resist to not add the parameters support:

```js
var device_commands = root.resource(new RegExp('/device/(\w+)/command/(\w+)'))
    .param(1, 'device_type')
    .param(2, 'command', function(req, res, next, value){
        if (['start', 'stop'].indexOf(value) == -1)
            next(new Error('Unsupported command'));
        else {
            req.params['command'] = value;
            next();
        }
    })
    .method('invoke', function(req, res){
    });
```

Parameters are defined as simple capture groups in a RegExp. To have named 
params, you use the `Resource.param(index, [, callback])` Resource method 
which maps a group to a middleware invocation:

* `index` is the positional index of the capture group
* `callback` is the middleware that alters the `Request` object using the 
    parameter value: `function(req, res, next, value)`.
    
To have named parameters, you typically place them in the `Request.params` 
object designed for that.

Merging Resources
-----------------

For modularity, you might want to distribute your resources across different 
files and then merge with with the `Resource.merge(resource, ...)` method:

1. Adds all methods from the resources to the current one
1. Adds all middleware from the resources
2. Adds all sub-resources to the current one
3. If a resource would have been overwritten, it's merged.

```js
// Module
var module = new apiman.Root();
module.resource('/user')
    .method('get', function(req, res){ /* ... */})

// Extension
var extension = new apiman.Root();
module.resource('/user')
    .method('command', function(req, res){ /* ... */})

// Index file
var api = new apiman.Root();
api.merge(module, extension);
```

The example above results in a tree with a single `/user` Resource which has
two methods defined: `get` and `command`.

Executing methods
-----------------

To execute a method of your API root, use the 
`Resource.request(path, verb[, args[, req]], callback)` method:

* `path` is the path to some resource within the tree
* `verb` is the name of the method to execute
* `args` is the arguments object for the method. Optional.
* `req` is an object with extended request fields. Optional.
    Useful to populate additional `Request` fields at the invocation time: say,
    user session.
* `callback` accepts the method output: `function(err, result)`.

`Resource.request()` does the following:

1. Creates the `Request` and `Response` object
2. Traverses the tree using a prefix match technique and gets down 
    to the matching Resource
3. All middleware added to resources down the path are scheduled for the request
4. Any parameter callbacks down the path are also scheduled
5. Picks a method by `verb`
6. Executes all collected middleware
7. Executes the method middleware
8. Executes the method
9. Fires the callback

If a resource or method is not found, the function returns `false`.

Mapping
=======
