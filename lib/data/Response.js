'use strict';

var Q = require('q')
    ;

/** ApiMan response object
 *
 * @property {Request} request
 *      The associated request
 * @property {Q} promise
 *      Promise for the result
 *
 * @constructor
 */
var Response = exports.Response = function(){
    this.request = undefined;
    this.promise = Q.defer();
};

/** Send a response
 * @param {Error?} err
 *      The error object to respond with
 * @param {*?} result
 *      Response data
 */
Response.prototype.send = function(err, result){
    if (err)
        d.reject(err);
    else
        d.resolve(result);
};

/** Convenience method for successful responses
 * @param {*} result
 */
Response.prototype.ok = function(result){
    this.send(undefined, result);
};

/** Convenience method for errorneous responses
 * @param {Error} error
 */
Response.prototype.error = function(error){
    this.send(error, undefined);
};
