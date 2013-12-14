'use strict';

/** Error objects
 * @fileOverview
 */

var util = require('util'),
    _ = require('lodash')
    ;



/** Base ApiMan Error
 *
 * @constructor
 * @extends {Error}
 */
var ApiError = exports.ApiError = function(message){
    Error.apply(this, arguments);
    Error.captureStackTrace(this, this.constructor);
    this.message = message;
};
util.inherits(ApiError, Error);
ApiError.prototype.name = 'ApiError';



/** Resource or method was not found
 * @constructor
 * @extends {ApiError}
 */
var NotFound = exports.NotFound = function(path, method){
    this.path = path;
    this.method = method;
    Error.call(this, 'Resource not found: "' + path + ':' + method + '"');
    Error.captureStackTrace(this, this.constructor);
};
util.inherits(NotFound, ApiError);
NotFound.prototype.name = 'NotFound';



/** Middleware runtime error
 * @constructor
 * @extends {ApiError}
 */
var MiddlewareError = exports.MethodError = function(path, method, error){
    this.path = path;
    this.method = method;
    Error.call(this, 'Middleware error on "' + path + ':' + method + '": ' + error);
    Error.captureStackTrace(this, this.constructor);

    if (error instanceof Error)
        this.stack = error.stack;
};
util.inherits(MiddlewareError, ApiError);
MiddlewareError.prototype.name = 'MiddlewareError';



/** Method runtime error
 * @constructor
 * @extends {ApiError}
 */
var MethodError = exports.MethodError = function(path, method, error){
    this.path = path;
    this.method = method;
    Error.call(this, 'Method error on "' + path + ':' + method + '": ' + error);
    Error.captureStackTrace(this, this.constructor);

    if (error instanceof Error)
        this.stack = error.stack;
};
util.inherits(MethodError, ApiError);
MethodError.prototype.name = 'MethodError';
