'use strict';

var async = require('async'),
    _ = require('underscore'),
    Response = require('../workflow/Response').Response
    ;

/** API Manager Method
 *
 * A Method is an executable entity of a Resource which accepts arguments to produce a result.
 * @constructor
 *
 * @param {Resource} resource
 *      The parent resource
 * @param {String|Array.<String>} verb
 *      Method verb
 * @param {Array.<{function(req: Request, res: Response, next: function(Error?)}>} callbacks
 *      Middleware and the method itself being the last one (Express-style)
 */
var Method = exports.Method = function(resource, verbs, callbacks){
    /** The parent resource
     * @type {Resource}
     * @protected
     */
    this.resource = resource;

    /** Method verbs
     * @type {Array.<String>}
     * @protected
     */
    this.verbs = _.isArray(verbs)? verbs : [verbs];

    /** Callbacks
     * @type {Array.<Function>}
     * @protected
     */
    this.callbacks = callbacks;
};

/** Execute the method and its middleware with the provided request
 * @param {Request} req
 *      Request object
 * @param {Response} res
 *      Response object
 */
Method.prototype.exec = function(req, res){
    // Invoke the callbacks serially
    async.series(
        _(this.callbacks).map(function(cb){
            return _.partial(cb, req, res); // cb(req, res,   next), `next(err)` provided by async
        }),
        function(err, results){
            if (err)
                res.error(err);
        }
    );
};
