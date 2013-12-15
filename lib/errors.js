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
 *
 * @param {String} path
 *      Client path
 * @param {String} method
 *      Client method
 *
 * @constructor
 * @extends {ApiError}
 */
var NotFound = exports.NotFound = function(path, method){
    this.path = path;
    this.method = method;
    Error.call(this);
    Error.captureStackTrace(this, this.constructor);
    this.message = 'Not found: "' + path + ':' + method + '"';
};
util.inherits(NotFound, ApiError);
NotFound.prototype.name = 'NotFound';



/** Method runtime error
 *
 * @param {String} path
 *      Client path
 * @param {String} method
 *      Client method
 * @param {String|Error} error
 *      The error occurred
 *
 * @constructor
 * @extends {ApiError}
 */
var MethodError = exports.MethodError = function(path, method, error){
    this.path = path;
    this.method = method;
    Error.call(this);
    Error.captureStackTrace(this, this.constructor);
    this.message = 'Method error on "' + path + ':' + method + '": ' + error;

    if (error instanceof Error)
        this.stack = error.stack;
};
util.inherits(MethodError, ApiError);
MethodError.prototype.name = 'MethodError';


/** Invalid argument provided to a method
 *
 * @param {String} path
 *      Client path
 * @param {String} method
 *      Client method
 * @param {String|Error} error
 *      The error occurred
 *
 * @constructor
 * @extends {ApiError}
 */
var InvalidMethodArgument = exports.InvalidArgument = function(path, method, argument, error){
    this.path = path;
    this.method = method;
    this.argument = argument;
    Error.call(this);
    Error.captureStackTrace(this, this.constructor);
    this.message = 'Invalid method argument "'+argument+'": ' + error;

    if (error instanceof Error)
        this.stack = error.stack;
};
util.inherits(InvalidMethodArgument, ApiError);
InvalidMethodArgument.prototype.name = 'InvalidMethodArgument';
