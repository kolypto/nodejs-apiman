ApiMan
======

ApiMan is the API methods manager that are exportable to multiple protocols, 
including REST via Express.

The Motivation
--------------

When your app needs a REST API - Express is a great choice, but imagine you 
need to support multiple protocols at the same time and want to have the code
organized. Faking requests for Express is a tricky thing that is not guaranteed
to function as it progresses...

ApiMan steps in: you define a tree of resources with named methods bound to 
them, and now just bind it to Express as a middleware. Wait, some methods should
also be available through socket.io? No problem.

Now, we want some middleware for data preparation and authentication? 
Yes, we support that.

Enjoy it, guys :)



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
`Resource.request(path, verb, args[, req], callback)` method:

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

### Matching

In the examples above we follow the REST naming conventions for clarity, but 
again, that is not required.

Given a path, ApiMan performs a case-sensitive exact prefix matching. 
For instance, given the following resources chain:

```js
var root = new apiman.Root();
root.resource('/user')
    .resource('/device/commands')
        .resource('/private');
```

path `'/user/device/commands/private'` recursively matches each resource by 
prefix: `'/user'`, `'/device/commands'`, `'/private'`.

Don't expect ApiMan to forgive extra or missing slashes: it's protocol-agnostic 
by design and, potentially, all special characters might have a meaning.

Anyway, nothing prevents you from making a preprocessor which tunes the input
to your taste:

```js
// Ensure a leading slash, no trailing slash, and collapse duplicate slashes
path = ('/' + path).replace(/\/+/g, '/').replace(/\/$/, '');
```






Exporting the API
=================

socket.io
---------

Piece of cake: as socket.io can exchange json objects, you just need a 
handy convention for sending requests and getting responses.

The only difficulty is that socket.io does not support the request-response
protocol out of the box, but we can easily overcome that by numbering the 
packets.

Given the above, let's use the following data exchange protocol:

* Request:  `{{ id: Number, path: String, verb: String, args: Object }}`
* Response: `{{ id: Number, data: [ undefined, Object ] }}`
* Error:    `{{ id: Number, data: [ String|Error, undefined ] }}`

On the server:

```js
io.sockets.on('connection', function (socket) {
    socket.on('api', function (data) {
        root.request(data.path, data.verb, data.args, function(err, result){
            // Emit the result using the same method id
            socket.emit('api.result', { 
                id: data.id, 
                ret: [err, result]
            });
        }) ||
            socket.emit('api.result', {
                id: data.id, 
                ret: ['unknown method', undefined]
            });
    });
});
```

And on the client:

```js
io_method = function(path, verb, args, callback){
    var request = {
        id: io_method._id++, // packet id
        path: path,
        verb: verb,
        args: args
    };
    io_method._wait[request.id] = callback;
    socket.emit('api', request);
};
io_method._id=0;
io_method._wait = {};

// Listen for responses
socket.on('api.result', function(data){
    io_method._wait[data.id].apply(null, data.ret);
});
```

This approach, however, has 2 weak points:

* On reconnect, the response can't be received transparently
* The exposed error objects can potentially contain sensitive data 
    like stack traces



Express
-------

Assume you already have your API defined under the `root` variable, and now it's 
time to export it to Express. There are a couple of things to take care of:

1. Map your resources and methods to paths
2. Format the output for responses
3. Decide on the HTTP status code for errors

If your resources & methods (expecially their verbs) are directly exportable
to Express and compatible with REST, you're lucky:

```js
app.use('/api', function(req, res){
    var path = req.path,
        args = _(req.body).extend(req.query), // combine
        verb = req.method,
        apireq = {} // additional fields for Request
        ;
    
    // Pass the request to ApiMan
    var found = root.request(path, verb, args, apireq, function(err, result){
        // Format the output
        if (err)
            res.type('json').send(err.httpCode || 500, { error: err.message });
        else
            res.type('json').send(result);
    });
    
    // Method not found
    if (!found)
        res.type('json').send(404, { error: 'Unknown API method' });
});
```

The only issue that remains is that all error codes are `400`: we don't 
differentiate server errors, client errors and stuff. To overcome that, you'd 
need a convention:

* Always return an error object with a custom HTTP status code set.
    Default to 500 for other cases (all other errors)
* Create a hierarchy of custom `Error` objects with an http status code
    defined on each, and return them.

### Complex mappings

ApiMan supports a richer methods collection interface which's not limited to
HTTP methods: as an example, imagine a `/user` resource with methods 
`load`, `save`, `del`, `block`, `list`. While for CRUD methods you can just 
map the HTTP verbs (`GET` -> `load`), the `block` and `list` method would have 
required sub-resources and/or query strings.

That's what you need the mappers for.

First, change your Express middleware a little to enable mappers for 'express' 
on the request:

```js
// Tell ApiMan we're from Express
root.requestFrom('express', path, verb, args, req, function(err, result){ 
    /* ...*/ 
});
```

In order for the magic to work for us, we need to declare mappers on 
non-exportable resources which routes the REST requests to ApiMan methods.

Observe the example:

```js
var user = root.resource('/user');

user.method('load', function(req, res){/*...*/});
user.method('save', function(req, res){/*...*/});
user.method('del', function(req, res){/*...*/});
user.method('block', function(req, res){/*...*/});
user.method('list', function(req, res){/*...*/});

user.map('express', function(path, verb){
    // Trick the incoming (path,verb)
    switch (path){
        case '': // endpoint
            return [
                path, 
                // Change the verb
                {GET: 'load', POST: 'save', DELETE: 'del'}[verb]
            ];
        case '/list': // fake path
            return ['', 'list']; // route to the method
        case '/block':
            return ['', 'block'];
    }
    return undefined; // unchanged
});
```

The mapper function can be defined on any resource and is invoked when the 
resource tree is traversed. It accepts the `(path,verb)` pair, where `path` is
the current path remainder with all matched prefixes already truncated. It's
expected to return an altered `[path,verb]` pair sufficient for the subsequent
resource/method lookup to succeed.

As usually simple path/verb mapping is enough, you can save a callback and give
a mapping instead:

```js
user.map('express', {
    '': ['', {GET: 'load', POST: 'save', DELETE: 'del'}]
    '/list': ['', 'list'],
    '/block': ['', 'block'],
});
```

The mapper will search for the path remainder in the object keys. If the value
is an array - it's taken as a `[path,verb]` pair, where the verb can be 
specified as a mapping.
