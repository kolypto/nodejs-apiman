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
 * @property {Object} args
 *      Arguments for the method
 * @property {String} path
 *      The client path
 * @property {String} verb
 *      The client verb
 */
var Request = exports.Request = function(target, path, verb, args){
    this.path = path;
    this.verb = verb;
    this.args = args;

    this.root = target;
    this.resource = undefined;
    this.method = undefined;
};
