'use strict';

/** Resource path parameter
 * @param {String} name
 *      Parameter name
 * @param {function(req: Request, res: Response, value:*, next: function(Error)):*?} callback
 *      Preprocess function for the parameter
 * @constructor
 */
var PathParam = exports.PathParam = function(name, callback){
    this.name = name;
    this.callback = callback;
};

/** Create a middleware to process the param
 * @param {String} val
 *      The parameter value from the path string
 * @returns {function(Request, Response, function(Error), *)}
 */
PathParam.prototype.middleware = function(val){
    var self = this;
    return function(req, res, next){
        self.callback(req, res, next, val);
    };
};
