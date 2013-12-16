'use strict';

var request = require('request'),
    Q = require('q'),
    _ = require('lodash')
    ;

/** Stateful API client
 * @param {String} endpoint
 *      HTTP API endpoint
 */
var ApiClient = exports.ApiClient = function(endpoint){
    this.endpoint = endpoint + '/';
    this.sessionID = undefined;
};

/** Call a method
 * @param {String} path
 * @param {String} verb
 * @param {Object} args
 * @returns {Q} promise
 */
ApiClient.prototype.call = function(path, verb, args){
    var d = Q.defer();

    request({
        url: this.endpoint + '/' + path + ':' + verb,
        json: args,
        headers: this.sessionID? { Cookie: 'sessionID=' + this.sessionID } : {},
        jar: true // save cookies
    }, function(e, r, body){
        // Body
        try {
            if (_.isString(body)) // FIXME: why is it a string sometimes??
                body = JSON.parse(body);
        }catch(e){
            d.reject(e);
        }

        // Result
        if (body.error || r.statusCode !== 200)
            d.reject(body);
        else
            d.resolve(body);
    });

    return d.promise;
};
