'use strict';

module.exports = {
    get session(){
        return require('./session').sessionMiddleware
    }
};
