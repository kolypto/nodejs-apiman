'use strict';

var util = require('util'),
    Resource = require('./Resource').Resource
    ;

/** API manager Root
 * @constructor
 * @extends {Resource}
 */
var Root = exports.Root = function(){
    Resource.call(this, this, this, undefined);
};
util.inherits(Root, Resource);
