'use strict';

var Q = require('q'),
    connect = require('connect'),
    uid = require('uid2')
    ;

/** Session middleware, compatible with `connect`
 * @see <http://www.senchalabs.org/connect/session.html>
 *
 * @param {Object} options
 *      {Request} object field name that provides the session id from the request
 * @param {connect.Store?} options.store
 *      Session store instance. Optional: {connect.MemoryStore} is used as a default
 * @param {Number?} options.maxAge
 *      Maximum session lifetime in milliseconds. `null` produces a single-connection session.
 * @param {String} options.secret
 *      Session id is signed with secret to prevent tampering
 *
 * @returns {function(Request, Response)}
 */
var sessionMiddleware = exports.sessionMiddleware = function(options){
    /* To use the 'connect' session object, we need to have compatible interfaces:
     * - Set up the req.sessionStore as an object of {connect.Store}
     * - Mimic the connect.session middleware behavior
     */

    // Generates the new session
    var store = options.store || connect.session.MemoryStore;
    store.generate = function(req){
        req.sessionID = uid(24);
        req.session = new connect.session.Session(req);
        // Expose cookie: {Session} and {Store} objects need it
        req.session.cookie = new connect.session.Cookie({ maxAge: options.maxAge || null });
    };

    // Store readiness
    var storeReady = true;
    store.on('disconnect', function(){ storeReady = false; });
    store.on('connect', function(){ storeReady = true; });

    // Middleware
    return function(req, res){
        // Self-awareness
        if (req.session)
            return;

        // Store ready?
        if (!storeReady){
            // NOTE: this behavior differs from `connect` which proceeds on store errors!
            throw new Error('Session store has disconnected');
        }

        // Expose store: {Session} object needs it
        req.sessionStore = store;

        // Session save handler
        res.result.finally(function(){
            if (!req.session)
                return;

            req.session.resetMaxAge();
            req.session.save(function(err){
                if (err)
                    console.error(err.stack);
            });
        });

        // Initialize a new session when no session is available
        if (!req.sessionID){
            store.generate(req);
            return;
        }

        // Generate the Session object
        return Q.nmcall(store, 'get', req.sessionID)
            // Got a session
            .then(function(sess){
                // No session
                if (!sess){
                    store.generate(req);
                    return;
                }

                // Populate req.session
                store.createSession(req, sess);
            })
            // Error handling
            .catch(function(err){
                if ('ENOENT' === err.code) { // Not found: regenerate the session
                    store.generate(req);
                } else { // A real error
                    throw err;
                }
            });
    };
};
