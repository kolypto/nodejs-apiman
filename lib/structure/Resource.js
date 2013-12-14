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

Resource.toString = function(){
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
 */
Resource.prototype.method = function(verbs, method){
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

Resource.prototype.use = function(){
    // Arguments
    var middleware = _.toArray(arguments);
    if (!_.all(middleware, _.isFunction))
        throw new Error('apiman.Resource#use: middleware must be functions');

    // Add
    this.middleware = this.middleware.concat(middleware);

    // Finish
    return this;
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

/** Execute a method with the specified arguments
 * @param {String} path
 *      Path to a resource
 * @param {String} verb
 *      Method verb to look for
 * @param {Object} args
 *      Arguments for the method
 * @param {Object?} request
 *      Additional request fields
 * @returns {Q} promise for a result
 *
 * @throws {NotFound} Method not found (promised)
 * @throws {MethodError} Method runtime error (promised)
 * @throws {InvalidMethodArgument} Invalid arguments (promised)
 * @throws {Error} Method returned an error (promised)
 */
Resource.prototype.exec = function(path, verb, args, request){
    // Arguments
    request = request || {};
    args = args || {};
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

    // Exec
    return this.requestMethod(request);
};
Resource.prototype.exec = Q.fbind(Resource.prototype.exec);

/** Process a request
 * @param {Request} request
 *      The request object to process
 * @returns {Q} promise for a result
 *
 * @throws {NotFound} Method not found (promised)
 * @throws {MethodError} Method runtime error (promised)
 * @throws {InvalidMethodArgument} Invalid arguments (promised)
 * @throws {Error} Method returned an error (promised)
 */
Resource.prototype.request = function(request){
    // Arguments
    if (!request instanceof Request)
        throw new Error('apiman.Resource#request: `request` must be an instance of Request');

    // Response
    var response = new Response(request);

    // Find the method
    var method = this.which(request.path, request.verb, request);
    if (!method)
        throw new errors.NotFound(request.path, request.verb);

    // Execute middleware & method while the response is pending
    _.map(request.middleware.concat(method), function(f){
        return function(){
            if (response.promise.isPending()) // only if the result is still pending
                return f(request, response);
        };
    }).reduce(Q.when, Q(1))
        .catch(function(err){
            response.defer.reject(
                new errors.MethodError(request.path, request.verb, err)
            );
        });

    // Got any result?
    if (response.promise.isPending())
        response.defer.reject(
            new errors.MethodError(request.path, request.verb, 'No response sent')
        );

    // Finish
    return response.promise;
};
Resource.prototype.request = Q.fbind(Resource.prototype.request);

//endregion
