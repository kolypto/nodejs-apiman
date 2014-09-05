[![Version](https://badge.fury.io/js/apiman.png)](https://npmjs.org/package/apiman)
[![Dependency Status](https://gemnasium.com/kolypto/nodejs-apiman.png)](https://gemnasium.com/kolypto/nodejs-apiman)
[![Build Status](https://travis-ci.org/kolypto/nodejs-apiman.png?branch=master)](https://travis-ci.org/kolypto/nodejs-apiman)

**PROJECT FROZEN**: Since I'm not doing much NodeJS nowadays, the project is not going to develop in the nearest future!

ApiMan
======

Generic API methods manager that is exportable to arbitrary protocols, including HTTP and websockets.

Key features:

* Hierarchical API methods stored on Resources
* Middleware support
* Promise-based: using the [q](https://npmjs.org/package/q) package
* Full unit-tests

The Motivation
--------------

For a REST API, Express is a great choice, but imagine you
need to support multiple protocols at the same time and want to have the code
organized. Faking requests for Express is a tricky thing that is not guaranteed
to function as it progresses...

ApiMan steps in: you define a tree of resources with named methods bound to
them, and now just bind it to Express as a middleware. Wait, some methods should
also be available through socket.io? No problem.

Now, we want some middleware for data preparation and authentication?
Yes, we support that.

Enjoy it, guys :)






Table of Contents
=================

* <a href="#core-components">Core Components</a> 
    * <a href="#resource-root">Resource, Root</a> 
        * <a href="#resourceresourcepathresource">Resource.resource(path):Resource</a> 
    * <a href="#method">Method</a> 
        * <a href="#resourcemethodverbs-middleware---methodresource">Resource.method(verbs[, middleware, ..., ], method):Resource</a> 
    * <a href="#request">Request</a> 
    * <a href="#response">Response</a> 
        * <a href="#responsesenderr-result">Response.send(err, result)</a> 
        * <a href="#responseokresult">Response.ok(result)</a> 
        * <a href="#responseerrorerr">Response.error(err)</a> 
        * <a href="#responseispendingboolean">Response.isPending():Boolean</a> 
* <a href="#middleware">Middleware</a> 
    * <a href="#method-middleware">Method Middleware</a> 
    * <a href="#resource-middleware">Resource Middleware</a> 
        * <a href="#resourceusemiddleware-resource">Resource.use(middleware[, ...]):Resource</a> 
* <a href="#executing-methods">Executing Methods</a> 
    * <a href="#public-api">Public API</a> 
        * <a href="#resourceexecpath-verb-args-reqq">Resource.exec(path, verb, args, req):Q</a> 
    * <a href="#internal-methods">Internal Methods</a> 
        * <a href="#resourcewhichpath-verb-requestmethod">Resource.which(path, verb[, request]):Method?</a> 
        * <a href="#resourcerequestrequestresponse">Resource.request(request):Response</a> 
    * <a href="#handling-results">Handling Results</a> 
    * <a href="#prefix-matching">Prefix Matching</a> 
* <a href="#special-features">Special Features</a> 
    * <a href="#endpoint-resources">Endpoint Resources</a> 
        * <a href="#resourceendpointmethodmiddleware--methodresource">Resource.endpointMethod([middleware, ...], method):Resource</a> 
    * <a href="#controller-methods">Controller Methods</a> 
        * <a href="#resourcecontrollermethodsctrlresource">Resource.controllerMethods(ctrl):Resource</a> 
* <a href="#bundled-middleware">Bundled Middleware</a> 
    * <a href="#session-middleware">Session Middleware</a> 






Core Components
===============

Resource, Root
--------------

A Resource is a collection of sub-resources, middleware and methods that is identified by path.

You create a sub-resource by calling the `Resource.resource(path)` method of
a parent `Resource` or the `Root` container:

```js
var root = new apiman.Root();

var user = root.resource('/user');
var user_profile = user.resource('/profile');
```

You create a Root resource first, then continue defining the resources on it.
The Root is actually a resource with an empty path.

Although we follow the HTTP-style slash-separated paths, you're free to use any
convention you're comfortable with.

The following properties may be useful:

```js
user.root; // Reference to the root Resource
user.parent; // Parent resource
user.path; // Parent resource
```

### Resource.resource(path):Resource
Add a new child Resource and assign a `path` to it.

Returns: the new `Resource` object.



Method
------

After you have set up the resources hierarchy, you can define methods on them, including the Root.

A `Method` is defined with the `Resource.method(verbs, ...callbacks)` method of  a `Resource`:

```js
user_profile.method('save', function(req, res){
    return save_to_db(req.args.user)
        .then(function(){
            res.ok({saved: true, id: id});
        });
});
```

The method callback accepts two arguments: the `Request` and `Response` objects. Use them to access the request data and
send responses.

The method should return a promise which is resolved when the method sends a result with [`Response.send()`](#responsesenderr-result).

### Resource.method(verbs[, middleware, ..., ], method):Resource
Add a Method to the Resource.

Arguments:

* `verbs: String|Array.<String>`: Method name, or an array of names.
    Later, the method will be available under this name.
* `middleware: function(req: Request, res: Response):Q`:
    Optionally provide an array of middleware methods that will be called before the method itself.
    See: [Middleware](#middleware).
* `method: function(req: Request, res: Response):Q`:
    The method function.



Request
-------

The `Request` object is created for each request and contains the info about the request: resource path, method name,
method arguments, fields added by the middleware, etc.

The `Request` object has the following properties:

* `req.path`: The requested resource:
    `'/user/profile'`
* `req.verb`: The requested method:
    `'save'`
* `req.args`: Method arguments object:
    `{ user: {login: 'kolypto', ...} }`
* `req.path_arr`: An array of path components split on matched resources:
    `['/user', '/profile']`
* `req.path_tail`: The remaining path suffix that's left after matching the resources.



Response
--------

The `Response` object is created coupled with the corresponding `Request` to handle the results of a method call:
a method reports errors and sends results through it.

Response has two *channels* to send the results with:

* *System channel*:
    A promise which is automatically resolved when the middleware and the method has finished successfully.
    If there was an unhandled exception, the promise is rejected with a *runtime error*.
    This logic is handled by the `Response.system` promise.
* *Result channel*:
    A promise which is manually resolved by the middleware or the method using `Response.send()`.
    This returns a result, or an expected erorr.
    This logic is handled by the `Response.result` promise.

This separation allows to differentiate unexpected erorrs and expected error responses:
the *System channel* reports unexpected runtime errors, while the
*Result channel* handles the expected results, including errors, which are usually send to the client as is.

### Response.send(err, result)
Send a result to the client: either an error or a successful result.

Note: when a promise, returned by a method, is resolved without sending any response, ApiMan creates a "No response sent"
error:

```js
root.method('empty', function(req, res){
    save_to_db(req.user, function(err){
        res.send(err, { ok: true }); // send an error, or an "ok" response
    });

    // the method returns nothing, so the response is resolved before callback function is called.
    // This results in a "No response sent" error.
});
```

This logic actually ensures that you'll never have your requests hanging indefinitely if a method does not send anything,
for instance, in case of a runtime error.

To make the above code error-prone, just return a promise which resolves once all operations are finished.

### Response.ok(result)
Convenience method that wraps `Response.send(undefined, result)`
### Response.error(err)
Convenience method that wraps `Response.send(err, undefined)`

### Response.isPending():Boolean
Check whether the response is in *pending* state: did not explicitly send any result.

When any middleware or method uses `Response.send()`, the Response is resolved and no subsequent middleware/method
is executed. In other words, if a middleware function sends a response, the method is not executed.






Middleware
==========
A middleware function is no different from the Method function: it accepts the `Request`, `Response` objects as arguments
and can send responses.

The difference is that the middleware is called before the Method function, and the middleware can be assigned to both
Resources and Methods.



Method Middleware
-----------------
Like in Express, each method can use an arbitrary list of middleware functions which are specified before the method
function. See: [Resource.method()](#resourcemethodverbs-middleware---methodresource).

```js
// Middleware function
var adminOnly = function(req, res){
    // Middleware
    if (!req.user.isAdmin)
        res.error('This action is forbidden for non-admin users');
};

user.method('delete',
    adminOnly, // middleware
    function(req, res){ // method function
        return db_delete(req.user_id); // remove the user
    }
);
```

Note that if any middleware sends a response, no subsequent middleware are executed, nor the method itself.



Resource Middleware
-------------------
Moreover, a middleware can be attached to a `Resource`: it will be executed for all methods of the resource itself
as well as for the methods of sub-resources:

```js
admin = root.resource('/admin');
admin.use(adminOnly); // all methods & sub-resources are not admin-only
```

### Resource.use(middleware[, ...]):Resource
Use the given middleware functions for the Resource.






Executing Methods
=================
After the Resource hierarchy and the methods are set up, you can call the methods by resource path and method name.

Public API
----------

### Resource.exec(path, verb, args, req):Q
Locate a method by `path` and `verb`, then execute it with `args`. Is usually called on the Root resource.

Arguments:

* `path: String`: Path to some resource.
* `verb: String`: Name of the method to execute.
* `args: Object?`: Method arguments object.
* `req: Object?`: Additional fields for the `Request` object. Useful to pre-populate the user session.
  The provided object also receives all the fields set by ApiMan: see [Request](#request).

Returns: A promise for a result, or an error. For runtime errors (reported through the [*System channel*](#response)), ApiMan sets
the Error object's `system` property to `true`: `err.system = true`.

This method does the following:

1. Create the `Request` and `Response` objects
2. Traverse the resources tree and find the matching resource with prefix matching.
   For instance, `'/user/profile'` first matches the `'/user'` resource, then its `'/profile'` child resource.
3. Find the method by name
4. Executes all resource middleware down the matching resources chain
5. Executed the method middleware and the method
6. If any middleware has sent a response, no subsequent middleware is executed, nor the method is.
7. If no response was sent, a "No response sent" error is reported
8. A promise for a result is returned

Internal Methods
----------------
While the `Resource.exec()` is usually enough, you might need these also.

### Resource.which(path, verb[, request]):Method?
Find a matching method by path and verb.

Arguments:

* `path: String`: Path to the wanted resource
* `verb: String`: Method name to look for
* `request: Request?`: Optional `Request` object. Is used to populate its fields.

Returns: The `Method` object, or `undefined` if not found.

### Resource.request(request):Response
Process the provided Request and return a Response.

This method allows you to use a custom `Request` object and process the `Response` in an arbitrary fashion.

Handling Results
----------------

```js
root.exec(
    '/user', // path
    'save', // method
    { login: 'kolypto' }, // method arguments
    {} // additional request fields
)
.then(function(result){
    // success: we have the result
})
.catch(function(err){
    // An error has occurred
    if (err.system){
        // runtime error: unhandled exception
    } else {
        // method error: reported with Response.send()
    }
});
```

Prefix Matching
---------------

Given a path, ApiMan performs a case-sensitive precise prefix matching.
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
For instance, you can use `'user.device.commands'` for resource names.

Anyway, nothing prevents you from making a preprocessor which tunes the input
to your taste:

```js
// Ensure a leading slash, no trailing slash, and collapse multiple slashes
path = ('/' + path).replace(/\/+/g, '/').replace(/\/$/, '');
```






Special Features
================

Endpoint Resources
------------------

You can create Resources that consume all requests that go into it: such resources have a single function that
handles all requests.

### Resource.endpointMethod([middleware, ...], method):Resource
Add an endpoint method on the Resource: the method that handles all requests that fall into the resource.

The `Request` object will have the `path_tail` property set to the remaining path suffix.

Arguments:

* `middleware: function(req: Request, res: Response):Q`:
    Optional middleware functions to use. See: [Method Middleware](#method-middleware)
* `method: function(req: Request, res: Response):Q`:
    The endpoint method to use.

Example:

```
var root = new apiman.Root(),
    upload = root.resource('/upload')
    ;

upload.endpointMethod(function(req, res){
    req.path_tail; // path suffix
    req.verb; // arbitrary method name
});

root.exec('/upload/file.txt', 'save', { file: ... })
    .then(function(){
        // upload saved
    });
```



Controller Methods
------------------
Adding all the methods manually is not the only way to define them: you can feed a Resource with an arbitrary object,
and ApiMan will import its methods. The MVC world knows this approach as *Controllers*.

### Resource.controllerMethods(ctrl):Resource
Add methods from a controller object.

ApiMan imports a property only if:

* It is a function (non-functional properties are ignored)
* Its name does not start with an underscore `_` (protected members are ignored).

Arguments:

* `ctrl: Object`: The controller to import the methods from.

Notes:

* All methods maintain the `this` binding: you can freely use controller fields and protected methods!
* In order to set middleware functions for a method, put them in the `middleware` proeprty of the method function.

Example:

```js
// Controller
var UserCtrl = function(something){ // constructor
    this.something = something;
};

UserCtrl.prototype.get = function(req, res){ // method
    res.ok({
        something: this.something,
        mw_worked: req.mw_worked,
        login: 'kolypto'
    });
};
UserCtrl.prototype.get.middleware = [ // middleware for the method
    function(req, res){
        req.mw_worked = 'yesss!';
    }
];

UserCtrl.prototype.set = function(req, res){ // another method
    res.ok({ ok: true });
};

UserCtrl.prototype._private = function(){};

// Import an instantiated controller
var root = new apiman.Root(),
    user = root.resource('/user')
    ;
user.controllerMethods(new UserCtrl('anything'));
```

This will make the '/user:get' and '/user:set' methods available.






Bundled Middleware
==================
All bundled middleware come in the `require('apiman').middleware` module.

Session Middleware
------------------

Initializer: `apiman.middleware.session(options)`

Port of the [connect.session](http://www.senchalabs.org/connect/session.html) middleware which allows you
to reuse the session Store backends,
like the [connect-redis](https://npmjs.org/package/connect-redis) package.

```js
var root = new apiman.Root;
root.use(apiman.middleware.session({
    // Session store backend, Connect-compatible.
    // When unspecified, uses MemoryStore
    store: new connect.session.MemoryStore(),
    // Maximum session lifetime in milliseconds.
    // `null` produces a one-shot session.
    maxAge: 60*60*24 *1000, // 1 day
    // Session id is signed with this secret to prevent tampering
    // NOTE: not implemented!
    secret: 'cockatoo parrot'
});
```

When a session middleware is in effect, the `Request` object gets the following extra fields:

* `req.sessionID: String`: The session identifier string
* `req.session: Object`: The persistent session object
* `req.sessionStore: connect.Store`: The session store backend

The session is only saved if the middleware & the method has had no runtime errors (thrown exceptions)!

Example on how to make 2 requests using a single session:

```js
var sessionID; // remember the session ID

// First request: sign in, get the session
var req = {}; // sessionID will be stored here

root.exec('/login', 'login', { user: 'kolypto', pass: '1234' }, req)
    .then(function(result){
        // Successful login
        // req.sessionID is populated
        sessionID = req.sessionID; // keep it
    })
// Second request: use the same session id
    .then(function(){
        // use sessionID got from the previous request
        return root.exec('/cart', 'show', {}, { sessionID: sessionID })
            .then(function(result){
                // fine
            });
    })
    .done()
    ;
```






Exporting the APIs
==================

In order to expose your APIs to some protocol, you need to implement the ApiMan method caller as a singular endpoint:
in other words, create a handler which transforms the input into an ApiMan `Resource.exec()` call and formats the output.

You can either [Export The APIs Manually](#exporting-the-apis-manually) or use one of the [Bundled Adapters](#bundled-adapters).

Bundled Adapters
----------------

Bundled adapters implement the most wanted protocol adapters in a reusable manner.

All bundled middleware come in the `require('apiman').adapters` module.

### Express Adapter
Express adapter is a middleware maker that catches all incoming requests under a path and handles them with ApiMan methods.

Initializer: `apiman.adapters.express(root, options)`

Arguments:

* `root: Resource|Root`: The resource to serve
* `options: Object`: Middleware options

    * `prepareRequest: function(req: Object):Request?`: An optional custom function that converts the incoming
      [Express `req` request](http://expressjs.com/api.html#req.path) into an ApiMan request.

      It should return an object with the additional Request fields. It's also required to return: `path`, `verb`, `args`.

      Default: split the request URI in 2 on ':' and get the `path` & `verb` ; combine request query & body into `args` ;
      pass the `req.files` as is.

      As a result, you call methods with '/path/to/resource:methodName', the arguments are provided as query params or sent
      in the request body as JSON.

    * `sessionCookie: { name: String, maxAge: Number }?`: When the [Session Middleware](#session-middleware) is used,
      you probably want to pass the sessionID through a cookie. To do that, specify the cookie settings here.

      Default: disabled.

      Fields: `name` is the name of the cookie (default: 'sessionID'), `maxAge` is the session expire time in seconds.

      See [express.cookie()](http://expressjs.com/api.html#res.cookie) and (connect.session)[http://www.senchalabs.org/connect/session.html] for more details.

    * `fixSlashes: Boolean?`: Whether to forgive extra slashes in the path. See [Prefix Matching](#prefix-matching).

      Default: true.

    * `sendResult: function(req: Object, res: Object, result: *)?`: An optional custom function that sends the result
      with [Express `res` response](http://expressjs.com/api.html#res.send).

      Default: sends the result as JSON with HTTP code 200.

      Arguments:

    * `sendError: function(req: Object, res: Object, error: Object, e:*)`: An optional custom function that sends the
      error with [Express `res` response](http://expressjs.com/api.html#res.send).

      Default: sends the result as JSON `{ error: error }`, with HTTP status code 500 for system errors, 400 for method errors.
      If the `e` error specifies the `httpcode` field, it overrides the chosen HTTP code.

      Arguments: `req`, `res` are Express request and response ; `e` is the original error; `error` is the prepared
      error object which is guaranteed to be an object.

      Note: as methods in general can return errors of any type, this adapter casts them to a guaranteed object
      `{ message: String, system: Boolean }` format.

Example:

```js
var apiman = require('apiman'),
    express = require('express')
    ;

// Resources
var root = new apiman.Root();
root.use(apiman.middleware.session()); // ApiMan sessions

// Prepare Express
var app = express();
app.use(express.cookieParser()); // enable cookies
app.use(express.bodyParser()); // enable JSON

// Expose the APIs
app.use('/api', apiman.adapters.express(root));
```

For a mature example, see [/tests/adapters-express-test.js](tests/adapters-express-test.js).


Exporting The APIs Manually
---------------------------

This section describes how to export the APIs manually. There are [Bundled Adapters](#bundled-adapters) that
simplify this part with convenient helpers.

### Express
Assuming you already have your APIs set up under the `root` Resource, let's export these to HTTP with
[Express](https://npmjs.org/package/express).

First, you need to decide on the conventions to use for:

1. Method call convention.

    Example: Using URI for Resource paths, method is provided after a colon `:`. the arguments are sent either through
    the query params or in the request body as a JSON object.

2. Successful responses

    Example: encode the output as JSON, with HTTP code 200.

3. Error responses:

   Example: `{ error: { code: Number, message: String } }`, as JSON.
   If the Error object has the `httpcode` property, send it as a code.

3. Error responses and HTTP codes

    Example: use HTTP code 400 by default.

4. System Error responses and HTTP codes

    Example: use HTTP code 500 by default.

Here's a simple solution:

```js
var express = require('express'),
    _ = require('lodash')
    ;

var root = new apiman.Root(); // assuming the resources and methods are defined

var app = express();

app.use('/api', function(req, res){
    // Input
    var _pathverb = req.path.split(':'),
        path = _pathverb[0], // resource path
        verb = _pathverb[1], // method name
        args = _(req.body).extend(req.query), // combine query & body
        apireq = {} // additional request fields
        ;
    // Execute the method
    root.exec(pathmethod, verb, args, apireq)
        // Handle success
        .then(function(result){
            res.type('json').send(result); // send the result
        })
        // Handle error
        .catch(function(err){
            res.type('json').send(err.system? 500 : 400, err); // send the error object
        })
        ;
});
```

For a full solution which supports files, sessions, and handles errors correctly, see [Express Adapter](#express-adapter).

### socket.io

Piece of cake: as socket.io can exchange json objects, you just need a
handy convention for sending requests and getting responses.

The only difficulty is that socket.io does not support the request-response
protocol out of the box, but we can easily overcome that by numbering the
packets.

Given the above, let's use the following data exchange protocol:

* Request:  `{{ id: Number, path: String, verb: String, args: Object }}`
* Response: `{{ id: Number, result: Object, error: null }}`
* Error:    `{{ id: Number, error: { code: Number, message: String } }}`

On the server:

```js
io.sockets.on('connection', function (socket) {
    socket.on('api', function (data) {
        root.exec(data.path, data.verb, data.args)
            .then(function(result){
                socket.emit('api.result', {
                    id: data.id, // send the same id back
                    result: result,
                    error: null
                });
            })
            .catch(function(err){
                socket.emit('api.result', {
                    id: data.id, // send the same id back
                    result: null,
                    error: err
                });
            });
    });
});
```

And on the client:

```js
apicall = function(path, verb, args, callback){
    var request = {
        id: apicall._id++, // packet id
        path: path,
        verb: verb,
        args: args || {}
    };
    apicall._wait[request.id] = callback;
    socket.emit('api', request);
};
apicall._id=0;
apicall._wait = {};

// Listen for responses
socket.on('api.result', function(data){
    apicall._wait[data.id].apply(null, data.ret);
});

// Usage
apicall('/news', 'list', {}, function(err, news){
    if (err){
        // error :(
    } else {
        // yeehaw!
    }
});
```

Weak points:

1. On reconnect, the response can't be received transparently
2. The exposed error objects can potentially contain sensitive data like stack traces
3. Callback-based interface: use promises instead
