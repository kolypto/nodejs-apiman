'use strict';

var events = require('events'),
    util = require('util')
    ;

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
 *
 * @extends {events.EventEmitter}
 *
 * @event {Request#method} (Method)
 *      When a method is found and is going to be called
 * @event {Request#done} (err, result)
 *      When a method was called and has sent a response
 */
var Request = exports.Request = function(path, verb, args){
    this.path = path;
    this.verb = verb;
    this.args = args || {};
    this.path_arr = [];

    this.params = {};

    this.response = undefined;
    this.middleware = [];
};
util.inherits(Request, events.EventEmitter);
