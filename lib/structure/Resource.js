'use strict';

var Q = require('q'),
    _ = require('lodash'),
    errors = require('../errors'),
    Method = require('./Method').Method,
    Request = require('../data/Request').Request,
    Response = require('../data/Response').Response
    ;

/** ApiMan Resource: a named collection of methods
 *
 * @param {Resource} root
 *      The root resource
 * @param {Resource} parent
 *      Parent resource
 * @param {String} path
 *      Path to this resource
 *
 * @constructor
 */
var Resource = exports.Resource = function(root, parent, path){
    // Check arguments
    if (!(root instanceof Resource))
        throw new Error('apiman.Resource: `root` must be Resource');
    if (!(parent instanceof Resource))
        throw new Error('apiman.Resource: `parent` must be Resource');
    if (!_.isString(path) && !_.isUndefined(path))
        throw new Error('apiman.Resource: `path` must be String|undefined');

    // Properties
    this.root = root;
    this.parent = parent;
    this.path = path;

    /** Child resources
     * @type {Object.<String, Resource>}
     */
    this.resources = {};

    /** Endpoint method (if set)
     * @type {Method?}
     */
    this.endpoint = false;

    /** Methods
     * @type {Object.<String, Method>}
     */
    this.methods = {};

    /** Middleware on the resource
     * @type {Array.<function(Request, Response):Q>}
     */
    this.middleware = [];
};

//region Names

Resource.prototype.toString = function(){
    var path = [],
        res = this;
    while (res !== undefined){
        if (res.path !== undefined)
            path.unshift(res.path); // Use either the name of the path
        if (res === res.parent)
            break;
        res = res.parent;
    }
    return path.join('');
};

//endregion

//region Structure

/** Add a child resource
 * @param {String} path
 * @returns {Resource}
 */
Resource.prototype.resource = function(path){
    // Create Resource
    var r = new Resource(this.root, this, path);
    this.resources[path] = r;
    return r;
};

/** Add a named method
 * @param {String|Array.<String>} verbs
 *      Method verbs
 * @param {...function(Request, Response):Q} method
 *      Middleware and the method itself being the last one (Express-style)
 * @returns {Resource}
 */
Resource.prototype.method = function(verbs, /* [,middleware,...] */ method){
    // Arguments
    var middleware = _.toArray(arguments).slice(1);
    method = middleware.pop();

    // Create the method
    var m = new Method(this, verbs, middleware, method);
    _.each(m.verbs, function(verb){
        this.methods[verb] = m;
    }.bind(this));

    // Finish
    return this;
};

/** Use the given middleware functions.
 * All requests that pass through this resource will first get processed by the middleware.
 * If any middleware function sends a response, the subsequent middleware and the method are not executed!
 * @param {...function(Request, Response):Q} middleware
 * @returns {Resource}
 */
Resource.prototype.use = function(middleware /* ,... */){
    // Arguments
    middleware = _.toArray(arguments);
    if (!_.all(middleware, _.isFunction))
        throw new Error('apiman.Resource#use: middleware must be functions');

    // Add
    this.middleware = this.middleware.concat(middleware);

    // Finish
    return this;
};

/** Add an endpoint method: the method that gets all requests that fall into the resource.
 * The `Request` object will have the `path_tail` property initialized to the path suffix.
 * @param {...function(Request, Response):Q} method
 *      Middleware and the method itself being the last one (Express-style)
 * @returns {Resource}
 */
Resource.prototype.endpointMethod = function(/* [middleware,...] */ method){
    // Arguments
    var middleware = _.toArray(arguments);
    method = middleware.pop();

    // Method
    this.endpoint = new Method(this, '*', middleware, method);

    // Finish
    return this;
};

Resource.prototype.controllerMethods = function(Controller){
};

//endregion

//region Execution

/** Check whether the current resource matches the given path prefix
 * @param {String} path
 * @param {Request?} request
 * @returns {{ head: String, tail: String }?}
 */
Resource.prototype.match = function(path, request){
    // Arguments
    if (!_.isString(path))
        throw new Error('apiman.Resource#match: `path` must be String');

    // Containers always match as they always delegate
    if (this.path === undefined)
        return { head: '', tail: path };

    // Match path
    if (path.indexOf(this.path) !== 0)
        return undefined; // prefix mismatch

    // Prefix matched! Pinch off the prefix
    return {
        head: path.substr(0, this.path.length),
        tail: path.substr(this.path.length)
    };
};

/** Find a matching method by path and verb
 * @param {String} path
 *      Path to the wanted resource
 * @param {String} verb
 *      Method verb to look for
 * @param {Request?} request
 *      Request object to use: augment it with `path_arr` and `middleware`
 * @returns {Method?}
 *      The found `Method` object or `undefined`
 */
Resource.prototype.which = function(path, verb, request){
    // Arguments
    if (!_.isString(path))
        throw new Error('apiman.Resource#which: `path` must be String');
    if (!_.isString(verb))
        throw new Error('apiman.Resource#which: `verb` must be String');

    // Prefix matching
    var match = this.match(path, request);
    if (match === undefined)
        return undefined;
    path = match.tail;

    // Augment the Request
    if (request){
        // Request.path_arr
        if (match.head.length) // only add path components when there was a match
            request.path_arr.push(match.head);

        // Request.middleware
        if (this.middleware.length)
            request.middleware = request.middleware.concat(this.middleware);
    }

    // Endpoint
    if (this.endpoint){
        if (request)
            request.path_tail = path;
        return this.endpoint;
    }

    // When the path is empty - we should have the method
    var method;
    if (!path){
        method = this.methods[verb];
        if (request && method)
            request.middleware = request.middleware.concat(method.middleware);
        return method;
    }

    // Path not empty: search sub-resources
    _.find(this.resources, function(resource){
        method = resource.which(path, verb, request);
        return method !== undefined;
    });

    // Failed to find anything
    return method;
};

/** Execute a method with the specified arguments and get a result.
 * @param {String} path
 *      Path to a resource
 * @param {String} verb
 *      Method verb to look for
 * @param {Object} args
 *      Arguments for the method
 * @param {Object?} req
 *      Additional request fields.
 *      They do nott override the existing fields.
 * @returns {Q} promise for a result
 *
 * @throws {Error} Invalid argument
 * @throws {NotFound} Method not found (promised)
 * @throws {MethodError} Method runtime error (promised)
 * @throws {InvalidMethodArgument} Invalid arguments (promised)
 * @throws {Error} Method returned an error (promised)
 */
Resource.prototype.exec = function(path, verb, args, req){
    // Arguments
    args = args || {};
    req = req || {};
    if (!_.isString(path))
        throw new Error('apiman.Resource#exec: `path` must be String');
    if (!_.isString(verb))
        throw new Error('apiman.Resource#exec: `verb` must be String');
    if (!_.isObject(args))
        throw new Error('apiman.Resource#exec: `args` must be Object');
    if (!_.isObject(req))
        throw new Error('apiman.Resource#exec: `req` must be Object');

    // Request
    var request = new Request(path, verb, args);
    if (req)
        _.defaults(request, req);

    // Exec
    var response = this.request(request);

    // Return a promise
    return response.getResult();
};

/** Process a request (low-level method)
 * @param {Request} request
 *      The request object to process
 * @returns {Response} The resolved response
 */
Resource.prototype.request = function(request){
    // Arguments
    if (!request instanceof Request)
        throw new Error('apiman.Resource#request: `request` must be an instance of Request');

    // Response
    var response = new Response(request);

    try {
        // Find the method
        var method = this.which(request.path, request.verb, request);
        if (!method){
            response.finished(new errors.NotFound(request.path, request.verb));
            return response;
        }

        // Execute middleware & method while the response is pending
        _.map(request.middleware.concat(method.exec.bind(method)), function(f){
            return function(){
                if (response.isPending())
                    return f(request, response);
            };
        }).reduce(Q.when, Q(1))
            // Any caught error is a runtime error
            .catch(function(err){
                response.finished(new errors.MethodError(request.path, request.verb, err));
            })
            // If the response is still pending - no response was sent
            .then(function(){
                if (response.isPending())
                    response.finished(new errors.MethodError(request.path, request.verb, 'No response sent'));
            });
    } catch(e){
        response.finished(e); // Internal ApiMan error
    }

    // Finish
    return response;
};

//endregion
