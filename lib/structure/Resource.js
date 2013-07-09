'use strict';

var _ = require('underscore'),
    Method = require('./Method').Method,
    Document = require('./Document').Document,
    Request =  require('../workflow/Request').Request
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
 * @param {String?} path
 *      Path to this resource, relative to the parent.
 */
var Resource = exports.Resource = function(root, parent, path){
    /** Root Resource
     * @type {Root}
     */
    this.root = root;

    /** Parent resource
     * @type {Resource}
     * @protected
     */
    this.parent = parent;

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
};

Resource.prototype = {
    get fullPath(){
        var list = [], res = this;
        while (res && res !== res.root){
            if (res.path)
                list.unshift(res.path);
            res = res.parent;
        }
        return list.join('');
    }
};

/** Add a child resource
 * @param {String} path
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

/** Merge another resource into this one
 * @param {Resource} resource
 * @returns {Resource}
 */
Resource.prototype.merge = function(resource){
    var self = this;

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

    // Finish
    return resource;
};

/** Define a named parameter
 * @param {String} name
 */
Resource.prototype.param = function(name){
    throw new Error('Not implemented'); // TODO: parameters
};

/** Check if the resource matches by path prefix and return it
 * @param {String} path
 * @returns {String?}
 */
Resource.prototype.match = function(path){
    // Containers always match as they always delegate
    if (this.path === undefined)
        return '';
    if (path.indexOf(this.path) !== 0)
        return undefined; // prefix mismatch
    // Prefix match! Bite the path
    return path.substr(0, this.path.length);
};

/** Find a method responsible for the path
 * @param {String} path
 *      Path to a resource
 * @param {String} verb
 *      Method verb to look for
 * @param {Request?} request
 *      An optional Reqeust object to fill the fields in
 * @returns {Method?}
 *      The found `Method` object or `undefined`
 */
Resource.prototype.which = function(path, verb, request){
    var mpath = this.match(path);
    if (mpath === undefined)
        return undefined;
    if (request && mpath.length)
        request.epath.push(mpath);
    path = path.substr(mpath.length);

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

    // Find the method
    var method = this.which(path, verb, request);
    if (!method)
        return false;

    // Invoke
    method.exec(request, callback);
    return true;
};
