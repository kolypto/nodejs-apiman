'use strict';

var Q = require('q'),
    _ = require('lodash')
    ;

/** ApiMan response object.
 *
 * Contains promises for two kinds of results:
 * - system: the result of executing a method.
 *   Resolved: the method has finished successfully (by sending results | error)
 *   Rejected: the method had runtime errors
 * - results: the data sent by the method
 *   Resolved: the method has reported a successful result
 *   Rejected: the method has reported an error by its own will
 *
 * @param {Request} request
 *      The associated request
 *
 * @property {Request} request
 *      The associated request

 * @property {Q} result
 *      Promise for a method result:
 *      - is resolved: method has sent a result
 *      - is rejected: method has send an error
 * @property {Q} system
 *      Promise for a system result:
 *      - is resolved: method has finished successfully (one of them has sent something by resolving `result`)
 *      - is rejected: method had runtime errors
 *
 * @constructor
 */
var Response = exports.Response = function(request){
    this.request = request;
    this.request.response = this; // bind

    this._defer = Q.defer();
    this.result = this._defer.promise;

    this._sysdefer = Q.defer();
    this.system = this._sysdefer.promise;
};

//region System

/** Indicate that the method has finished working.
 * Is used to report system errors
 * @param {ApiError?} err
 *      System error
 */
Response.prototype.finished = function(err){
    if (err)
        this._sysdefer.reject(err);
    else
        this._sysdefer.resolve();
};

/** Is the response still pending?
 * @returns {Boolean}
 */
Response.prototype.isPending = function(){
    return this.system.isPending();
};

//endregion

//region Result

/** Send a response
 * @param {Error?} err
 *      The error object to respond with
 * @param {*?} result
 *      Response data
 */
Response.prototype.send = function(err, result){
    // Result
    if (err)
        this._defer.reject(err);
    else
        this._defer.resolve(result);
    // System finished
    this._sysdefer.resolve();
};

/** Convenience method for successful responses
 * @param {*} result
 *      The result to send
 */
Response.prototype.ok = function(result){
    this.send(undefined, result);
};

/** Convenience method for errorneous responses
 * @param {*} error
 *      The error to send
 */
Response.prototype.error = function(error){
    this.send(error, undefined);
};

//endregion

//region Outcome

/** Get a simple promise for a result, or an error.
 * Use it if you don't want to deal with all this system/result logic: the two promises are combined, and in case
 * an error has occurred, you won't know whether it was a system error of a method error.
 * Still, when the resulting error is a system error, it gets a `system=true` property
 * @returns {Q} promise for a result
 */
Response.prototype.getResult = function(){
    var self = this;
    return this.system
        // System error
        .catch(function(err){
            if (_.isObject(err))
                err.system = true;
            return Q.reject(err);
        })
        // Method result || error
        .then(function(){
            return self.result; // promise for a result
        })
        ;
};

//region
