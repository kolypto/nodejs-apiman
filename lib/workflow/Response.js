'use strict';

/** API Response promise
 * @constructor
 *
 * @param {Method} method
 * @param {Request} request
 * @param {function(Response)} resolved
 *      Callback to invoke once the Response promise is resolved
 */
var Response = exports.Response = function(resolved){
    /**
     * @type {function(Response)}
     * @protected
     */
    this.resolved = resolved;

    /** Response error, if any
     * @type {Error?}
     */
    this.err = undefined;

    /** Response resule, if any
     * @type {*?}
     */
    this.result = undefined;
};

/** Send a response
 * @param {Error?} err
 *      The error object to respond with
 * @param {*?} result
 *      Response data
 */
Response.prototype.send = function(err, result){
    this.err = err? err : undefined;
    this.result = result? result : undefined;
    this.resolved(this);
};

/** Convenience function for successful responses
 * @param {*} result
 */
Response.prototype.ok = function(result){
    this.send(undefined, result);
};

/** Convenience function for errorneous responses
 * @param {Error} error
 */
Response.prototype.error = function(error){
    this.send(error, undefined);
};
