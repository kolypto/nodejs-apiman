'use strict';

/** API request
 * @constructor
 *
 * @property {Root} target
 *      Request target resource (often, the root)
 * @property {Resource} resource
 *      The effective Resource object
 * @property {Method} method
 *      The effective Method object
 *
 * @property {Object} args
 *      Arguments for the method
 * @property {String} path
 *      The client path
 * @property {String} verb
 *      The client verb
 *
 * @property {Array.<String>} path_arr
 *      Effective path components array
 * @property {Array.<Resource>} resources_arr
 *      Effective resources array
 * @property {Array} params
 *      Named parameters from the path
 *
 * @property {Response} response
 *      The bound response object
 * @property {Array.<function(req, res, next)>} middleware
 *      The middleware to be executed before the request
 */
var Request = exports.Request = function(target, path, verb, args){
    this.path = path;
    this.verb = verb;
    this.args = args;

    this.target = target;
    this.resource = undefined;
    this.method = undefined;

    this.path_arr = [];
    this.resources_arr = [];

    this.params = {};

    this.response = undefined;

    this.middleware = [];
};
