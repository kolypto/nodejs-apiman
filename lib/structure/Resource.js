'use strict';

var async = require('async'),
    _ = require('underscore'),
    Method = require('./Method').Method,
    Document = require('./Document').Document,
    Request =  require('../workflow/Request').Request,
    Response = require('../workflow/Response').Response,
    PathParam = require('./PathParam').PathParam
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
 * @param {Array.<String>} params
 *      Positional names for the params
 */
var Resource = exports.Resource = function(root, parent, path){
    /** Root Resource
     * @type {Root}
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
     */
    this.middleware = [];

    /** The list of positional param names
     * @type {Array.<PathParam>}
     * @protected
     */
    this.params = [];
};

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
 * @param {String} name
 *      Parameter name
 * @param {function(req: Request, res: Response, value:*, next: function(Error?)):*?} callback
 *      Parameter preprocess function, much like the middleware
 * @return {Resource}
 */
Resource.prototype.param = function(index, name, callback){
    this.params[index] = new PathParam(name, callback);
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
            // Add middleware
            request.middleware = request.middleware.concat(this.middleware);

            // Register params middleware
            for (var i = 1; i<this.params.length; i++)
                request.middleware.push(this.params[i].middleware(m[i]));
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
    if (request && match.head.length){
        request.resources_arr.push(this);
        request.path_arr.push(match.head);
    }
    path = match.tail;

    // When the path is empty - we should have the method
    if (!path){
        if (request){
            request.resource = this;
            request.method = this.methods[verb];
        }
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
 * @param {String} path
 *      Path to a resource
 * @param {String} verb
 *      Method verb to look for
 * @param {Object} args
 *      Arguments for the method
 * @param {function(Error?, result:*?)?} callback
 *      Callback invoked once the method finishes
 * @return {Boolean}
 *      Whether the method was found. If not, the `callback` will never be called
 */
Resource.prototype.exec = function(path, verb, args, callback){
    // Prepare the Request
    var request = new Request(this, path, verb, args);
    var response = new Response(request, function(res){
        callback(res.err, res.result);
    });
    request.response = response;

    // Find the method
    var method = this.which(path, verb, request);
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
