'use strict';

/** API request
 * @constructor
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
 * @property {Object} params
 *      Parameters from the path
 *
 * @property {Response} response
 *      The bound response object
 * @property {Array.<function(req, res, next)>} middleware
 *      The middleware to be executed before the request
 */
var Request = exports.Request = function(path, verb, args){
    this.path = path;
    this.verb = verb;
    this.args = args;
    this.path_arr = [];

    this.params = {};

    this.response = undefined;
    this.middleware = [];
};
