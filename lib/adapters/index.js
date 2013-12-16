'use strict';

module.exports = {
    get express(){
        return require('./express').expressMiddleware;
    }
};
