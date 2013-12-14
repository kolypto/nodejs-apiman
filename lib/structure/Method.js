'use strict';

var Q = require('q'),
    _ = require('lodash')
    ;

/** ApiMan Method
 * @param {Resource} resource
 *      The owner resource
 * @param {String|Array.<String>} verbs
 *      Method verbs
 * @param {Array.<function(Request, Response):Q>} middleware
 *      Middleware callbacks
 * @param {function(Request, Response):Q} method
 *      The method function
 * @constructor
 */
var Method = exports.Method = function(resource, verbs, middleware, method){
    this.resource = resource;
    this.verbs = [].concat(verbs);
    this.middleware = middleware;
    this.method = method;
};

Method.prototype.toString = function(){
    return this.resource.toString() + ':' + this.verbs.join('|');
};

/** Execute the method
 * @param {Request} req
 * @param {Response} res
 * @returns {Q} promise for completion
 */
Method.prototype.exec = function(req, res){
    return Q.fcall(this.method, req, res);
};
