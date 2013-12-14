'use strict';

/** ApiMan request object
 *
 * @param {String} path
 *      Client path
 * @param {String} verb
 *      Client verb (method name)
 * @param {Object} args
 *      Client arguments for the method
 *
 * @property {Array.<String>} path_arr
 *      Effective path components array
 * @property {Response} response
 *      The associated response
 * @property {Array.<function():Q>} middleware
 *      The scheduled middleware
 *
 * @constructor
 */
var Request = exports.Request = function(path, verb, args){
    this.path = path;
    this.verb = verb;
    this.args = args;

    this.path_arr = [];
    this.response = undefined;
    this.middleware = [];
};
