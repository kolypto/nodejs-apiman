'use strict';

var Q = require('q')
    ;

/** ApiMan response object
 *
 * @param {Request} request
 *      The associated request
 *
 * @property {Request} request
 *      The associated request
 * @property {Q} promise
 *      Promise for a result
 *
 * @constructor
 */
var Response = exports.Response = function(request){
    this.request = request;
    this.request.response = this;
    this.defer = Q.defer();
    this.promise = this.defer.promise;
};

/** Send a response
 * @param {Error?} err
 *      The error object to respond with
 * @param {*?} result
 *      Response data
 */
Response.prototype.send = function(err, result){
    if (err)
        this.defer.reject(err);
    else
        this.defer.resolve(result);
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
