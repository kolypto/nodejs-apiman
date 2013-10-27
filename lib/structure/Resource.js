'use strict';

var async = require('async'),
    _ = require('underscore'),
    Method = require('./Method').Method,
    Document = require('./Document').Document,
    Request =  require('../workflow/Request').Request,
    Response = require('../workflow/Response').Response
    ;

/** API Manager Resource
 *
 * A Resource is a collection of Methods and Resources.
 * @constructor
 *
 * @param {Resource} root
 *      The root resource
 * @param {Resource} parent
 *      Parent resource
 * @param {String|RegExp?} path
 *      Path to this resource, relative to the parent.
 */
var Resource = exports.Resource = function(root, parent, path){
    /** Root Resource
     * @type {Root}
     * @protected
     */
    this.root = root || this;

    /** Parent resource
     * @type {Resource}
     * @protected
     */
    this.parent = parent || this;

    /** Path to this resource, relative to the parent.
     * Is `undefined` for the Root
     * @type {String?}
     * @protected
     */
    this.path = path;

    /** Child resources map
     * @type {Object.<String, Resource>}
     * @protected
     */
    this.resources = {};

    /** Methods map
     * @type {Object.<String, Method>}
     * @protected
     */
    this.methods = {};

    /** Additional middleware functions to call before the request
     * @type {Array.<function(Request, Response, function(Error?))>}
     * @protected
     */
    this.middleware = [];

    /** The list of positional parameter callbacks
     * @type {Array.<function(Request, Response, function(Error?), *)>}
     * @protected
     */
    this.params = [];

    /** Mappers defined on this resource
     * @type {Object.<String, function(path: String, verb: String):Array>}
     * @protected
     */
    this.mappers = {};
};

//region Structure

/** Add a child resource
 * @param {String|RegExp} path
 *      Path to the new resource relative to this one
 * @returns {Resource}
 */
Resource.prototype.resource = function(path){
    var r = new Resource(this.root, this, path);
    this.resources[path] = r;
    return r;
};

/** Add a method under a verb
 * @param {String|Array.<String>} verbs
 *      Method verbs
 * @param {...function(req: Request, res: Response, next: function(err)} callback
 *      Middleware and the method itself being the last one (Express-style)
 * @returns {Method}
 */
Resource.prototype.method = function(verbs, callback){
    var callbacks = Array.prototype.slice.call(arguments, 1),
        method = new Method(this, verbs, callbacks);
    _(method.verbs).each(function(verb){
        this.methods[verb] = method;
    }.bind(this));
    return method;
};

/** Merge another resource into this one.
 * It merges: child resources, methods, middleware.
 * Existing resources are merged, not overwritten.
 * @param {...Resource} resource
 * @returns {Resource}
 */
Resource.prototype.merge = function(resource){
    var self = this;

    _(arguments).each(function(resource){
        // Merge resources
        _(resource.resources).each(function(res, path){
            if (!(path in self.resources)){
                self.resources[path] = res;
                res.parent = self;
                res.root = self.root;
            }
            else
                self.resources[path].merge(res);
        });

        // Merge methods
        _(resource.methods).each(function(method, verb){
            self.methods[verb] = method;
            method.resource = self;
        });

        // Merge middleware
        self.middleware = self.middleware.concat(resource.middleware);
    });

    // Finish
    return this;
};

/** Register a preprocess function for a named parameter
 * @param {Number} index
 *      Positional index in the regexp
 * @param {String|function(req: Request, res: Response, value:*, next: function(Error?)):*?} callback
 *      Parameter preprocess function, much like the middleware
 * @return {Resource}
 */
Resource.prototype.param = function(index, callback){
    this.params[index] = callback || undefined;
    return this;
};

/** Add middleware for this Resource
 * @param {...function(req: Request, res: Response, next: function(Error?))} callback
 * @return {Resource}
 */
Resource.prototype.use = function(callback){
    this.middleware = this.middleware.concat(arguments);
    return this;
};

//endregion

//region Execution

/** Check if the resource matches by path prefix and return it
 * @param {String} path
 * @param {Request?} request
 *      Request object to augment
 * @returns {{head: String, tail: String}?}
 */
Resource.prototype.match = function(path, request){
    // Containers always match as they always delegate
    if (this.path === undefined)
        return { head: '', tail: path };

    // Match path
    if (_.isRegExp(this.path)){
        // Match
        var m = this.path.exec(path);
        if (!m)
            return undefined;
        // Augment the request
        if (request){
            // Register params middleware
            for (var i = 1; i<this.params.length; i++)
                (function(param, val){
                    // Defined params
                    if (param !== undefined){
                        // Named params
                        if (!_.isFunction(param))
                            request.params[param] = val;
                        else // Functional params
                            request.middleware.push(function(req, res, next){
                                param(req, res, next, val);
                            });
                    }
                    else // indexed & non-defined params
                        request.params[i] = val;
                })(this.params[i], m[i]);
        }
        // Finish
        return {
            head: m[0],
            tail: path.substr(m[0].length)
        };
    } else { // string
        // Match
        if (path.indexOf(this.path) !== 0)
            return undefined; // prefix mismatch
        // Prefix match! Bite the path
        return {
            head: path.substr(0, this.path.length),
            tail: path.substr(this.path.length)
        };
    }
};

/** Find a method responsible for the path
 * @param {String} path
 *      Path to a resource
 * @param {String} verb
 *      Method verb to look for
 * @param {Request?} request
 *      Request object to augment
 * @returns {Method?}
 *      The found `Method` object or `undefined`
 */
Resource.prototype.which = function(path, verb, request){
    // Prefix matching
    var match = this.match(path, request);
    if (match === undefined)
        return undefined;
    path = match.tail;

    // Enable mappers
    if (request && this.mappers[request.from] !== undefined){
        var m = this.mappers[request.from](path, verb);
        if (m){
            path = m[0];
            request.verb = verb = m[1];
        }
    }

    // Augment the request
    if (request && match.head.length){
        // Path array
        request.path_arr.push(match.head);
        // Middleware
        request.middleware = request.middleware.concat(this.middleware);
    }

    // When the path is empty - we should have the method
    if (!path){
        return this.methods[verb]; // Method || undefined
    }

    // Path not yet empty: delegate the lookup to sub-resources
    var method;
    for (var i in this.resources)
        if (this.resources.hasOwnProperty(i)){
            method = this.resources[i].which(path, verb, request);
            if (method)
                return method;
        }

    // Failed to find anything
    return undefined;
};

/** Execute a method with arguments
 * @param {Request} request
 * @param {function(Error?, result:*?)?} callback
 *      Callback invoked once the method finishes
 * @return {Boolean}
 */
Resource.prototype.requestMethod = function(request, callback){
    // Prepare the response
    var response = new Response(function(res){
        callback(res.err, res.result);
    });
    request.response = response;

    // Find the method
    var method = this.which(request.path, request.verb, request);
    if (!method)
        return false;

    // Execute the middleware registered for the Resource
    async.series(
        _(request.middleware).map(function(mw){
            return _(mw).partial(request, response); // cb(req, res,   next), `next(err)` provided by async
        }),
        function(err){
            if (err)
                response.error(err);
            else
                method.exec(request, response);
        }
    );
    return true;
};

/** Execute a method with arguments
 * @param {String} path
 *      Path to a resource
 * @param {String} verb
 *      Method verb to look for
 * @param {Object} args
 *      Arguments for the method
 * @param {Object} req
 *      Additional request fields
 * @param {function(Error?, result:*?)?} callback
 *      Callback invoked once the method finishes
 * @return {Boolean}
 *      Whether the method was found. If not, the `callback` will never be called
 */
Resource.prototype.request = function(path, verb, args, req, callback){
    // Optional arguments
    if (_.isFunction(req)){ // (path, verb, args, callback)
        callback = req;
        req = {};
    }

    // Prepare the Request
    var request = new Request(path, verb, args || {});
    if (req)
        _(request).extend(req);

    // Exec
    return this.requestMethod(request, callback);
};

//endregion

//region Mapping

/** Define a mapper method for a handler type
 * @param {String} from
 *      Handler name
 * @param {function(path: String, verb: String):Array.<String>|Object} mapper
 *      Mapper function(path,verb)->[path,verb],
 *      or an object: { path: [path, verb], path: [path, {verb: verb}] }
 * @return {Resource}
 */
Resource.prototype.map = function(from, mapper){
    // Mapper is an object
    if (!_.isFunction(mapper)){
        // Generate a function from an object
        var f = function(path, verb){
            // Path not known for the mapping
            if (mapper[path] === undefined)
                return undefined; // unchanged

            // Path known
            var m = mapper[path]; // [path, verb]

            // Verb is not defined: save it
            if (m[1] === undefined)
                return [ m[0], verb ];

            // Verb is a string
            if (_.isString(m[1]))
                return [ m[0], m[1] ];

            // Verb is a mapping
            if (m[1][verb] === undefined)
                return undefined;
            return [ m[0], m[1][verb] ];
        };
        f.mapper = mapper; // keep it here

        return this.map(from, f);
    }

    // Mapper is a function
    this.mappers[from] = mapper;
    return this;
};

/** A version of `.request()` which enables the mappers
 * @param {String} from
 *      Handler name (to execute mappers)
 * @param {String} path
 * @param {String} verb
 * @param {Object} args
 * @param {Object} [req={}]
 * @param {function(Error?, result:*?)?} callback
 * @return {Boolean}
 */
Resource.prototype.requestFrom = function(from, path, verb, args, req, callback){
    // Optional arguments
    var args = Array.prototype.slice.call(arguments, 1);
    if (_.isFunction(req))
        args.splice(3,0, {}); // Insert the `req` argument

    // Provide the `from` request field
    args[3].from = from;

    // Exec
    return this.request.apply(this, args);
};

//endregion
