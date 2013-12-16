'use strict';

var express = require('express'),
    _ = require('lodash'),
    apiman = require('../../')
    ;

/** Create an Express middleware that serves methods from ApiMan
 *
 * @param {Root|Resource} root
 *      ApiMan root resource
 * @param {Object} options
 *      Middleware options
 * @param {function(req: Object):Request?} options.prepareRequest
 *      A custom function which prepares the `Request` object.
 *      Required fields: path, verb, args
 * @param {{ name: String, path: String?, maxAge: String? }?} options.sessionCookie
 *      Options for the session cookie.
 *      When set, the `session` middleware sessionID is set as a cookie with the given options
 * @param {Boolean} [options.fixSlashes=true]
 *      Whether to collapse multiple path slashes to a single one.
 * @param {function(req: Object, res: Object, result: *)?} sendResult
 *      An optional custom function to format the result.
 *      `result` is the method result
 * @param {function(req: Object, res: Object, error: { message: String }, e:*)?} sendError
 *      An optional custom function to send an erorr response.
 *      `error` is the prepared error object which is guaranteed to be an object.
 *      `e` is the original error, possibly an instance of Error.
 *
 * @returns {Function}
 */
var expressMiddleware = exports.expressMiddleware = function(root, options){
    // Arguments
    if (!(root instanceof apiman.Resource))
        throw new Error('apiman: expressMiddleware: Need a resource for the first argument');
    options = _.defaults(options || {}, {
        prepareRequest: undefined,
        sessionCookie: {
            name: 'sessionID',
            path: '/',
            maxAge: 60*60*24*31
        },
        fixSlashes: true,
        sendResult: undefined,
        sendError: undefined
    });

    return function(req, res){
        // Input
        var request;
        if (options.prepareRequest)
            request = options.prepareRequest(req);
        else {
            var pathmethod = req.path.split(':', 2);
            request = {
                path: pathmethod[0],
                verb: pathmethod[1],
                args: _.extend({}, req.body, req.query), // combine query & body
                files: req.files // pass the files
            };
        }

        // Options
        if (options.sessionCookie && req.cookies)
            request.sessionID = req.cookies[options.sessionCookie.name];
        if (options.fixSlashes)
            request.path = ('/' + request.path).replace(/\/+/g, '/').replace(/\/$/, '');

        // Execute the method
        root.exec(request.path, request.verb, request.args, request)
            // Always
            .finally(function(){
                // Set the session cookie
                if (options.sessionCookie && request.session)
                    res.cookie(
                        options.sessionCookie.name,
                        request.sessionID,
                        _.omit(options.sessionCookie, 'name')
                    );
            })
            // Handle success
            .then(function(result){
                if (options.sendResult)
                    options.sendResult(req, res, result);
                else
                    res.type('json').send(200, result);
            })
            // Handle error
            .catch(function(e){
                // Guarantee an object with `message`, `system` properties
                var error;
                if (_.isObject(e))
                    error = _.extend({}, e, _.pick(e, 'code', 'message'));
                else
                    error = { message: e };
                error.system = !!e.system;

                // Send
                if (options.sendError)
                    options.sendError(req, res, error, e);
                else {
                    if (e.system) // System errors
                        res.type('json').send(e.httpcode || 500, { error: error });
                    else // Method errors
                        res.type('json').send(e.httpcode || 400, { error: error })
                }
            });
    };
};
