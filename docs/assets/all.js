(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (process){
/****
 * Grapnel
 * https://github.com/bytecipher/grapnel
 *
 * @author Greg Sabia Tucker <greg@bytecipher.io>
 * @link http://bytecipher.io
 * @version 0.6.2
 *
 * Released under MIT License. See LICENSE.txt or http://opensource.org/licenses/MIT
*/

!(function(root) {

    function Grapnel(opts) {
        "use strict";

        var self = this; // Scope reference
        this.events = {}; // Event Listeners
        this.state = null; // Router state object
        this.options = opts || {}; // Options
        this.options.env = this.options.env || (!!(Object.keys(root).length === 0 && process && process.browser !== true) ? 'server' : 'client');
        this.options.mode = this.options.mode || (!!(this.options.env !== 'server' && this.options.pushState && root.history && root.history.pushState) ? 'pushState' : 'hashchange');
        this.version = '0.6.2'; // Version

        if ('function' === typeof root.addEventListener) {
            root.addEventListener('hashchange', function() {
                self.trigger('hashchange');
            });

            root.addEventListener('popstate', function(e) {
                // Make sure popstate doesn't run on init -- this is a common issue with Safari and old versions of Chrome
                if (self.state && self.state.previousState === null) return false;

                self.trigger('navigate');
            });
        }

        return this;
    };
    /**
     * Create a RegExp Route from a string
     * This is the heart of the router and I've made it as small as possible!
     *
     * @param {String} Path of route
     * @param {Array} Array of keys to fill
     * @param {Bool} Case sensitive comparison
     * @param {Bool} Strict mode
     */
    Grapnel.regexRoute = function(path, keys, sensitive, strict) {
        if (path instanceof RegExp) return path;
        if (path instanceof Array) path = '(' + path.join('|') + ')';
        // Build route RegExp
        path = path.concat(strict ? '' : '/?')
            .replace(/\/\(/g, '(?:/')
            .replace(/\+/g, '__plus__')
            .replace(/(\/)?(\.)?:(\w+)(?:(\(.*?\)))?(\?)?/g, function(_, slash, format, key, capture, optional) {
                keys.push({
                    name: key,
                    optional: !!optional
                });
                slash = slash || '';

                return '' + (optional ? '' : slash) + '(?:' + (optional ? slash : '') + (format || '') + (capture || (format && '([^/.]+?)' || '([^/]+?)')) + ')' + (optional || '');
            })
            .replace(/([\/.])/g, '\\$1')
            .replace(/__plus__/g, '(.+)')
            .replace(/\*/g, '(.*)');

        return new RegExp('^' + path + '$', sensitive ? '' : 'i');
    };
    /**
     * ForEach workaround utility
     *
     * @param {Array} to iterate
     * @param {Function} callback
     */
    Grapnel._forEach = function(a, callback) {
        if (typeof Array.prototype.forEach === 'function') return Array.prototype.forEach.call(a, callback);
        // Replicate forEach()
        return function(c, next) {
            for (var i = 0, n = this.length; i < n; ++i) {
                c.call(next, this[i], i, this);
            }
        }.call(a, callback);
    };
    /**
     * Add an route and handler
     *
     * @param {String|RegExp} route name
     * @return {self} Router
     */
    Grapnel.prototype.get = Grapnel.prototype.add = function(route) {
        var self = this,
            middleware = Array.prototype.slice.call(arguments, 1, -1),
            handler = Array.prototype.slice.call(arguments, -1)[0],
            request = new Request(route);

        var invoke = function RouteHandler() {
                // Build request parameters
                var req = request.parse(self.path());
                // Check if matches are found
                if (req.match) {
                    // Match found
                    var extra = {
                        route: route,
                        params: req.params,
                        req: req,
                        regex: req.match
                    };
                    // Create call stack -- add middleware first, then handler
                    var stack = new CallStack(self, extra).enqueue(middleware.concat(handler));
                    // Trigger main event
                    self.trigger('match', stack, req);
                    // Continue?
                    if (!stack.runCallback) return self;
                    // Previous state becomes current state
                    stack.previousState = self.state;
                    // Save new state
                    self.state = stack;
                    // Prevent this handler from being called if parent handler in stack has instructed not to propagate any more events
                    if (stack.parent() && stack.parent().propagateEvent === false) {
                        stack.propagateEvent = false;
                        return self;
                    }
                    // Call handler
                    stack.callback();
                }
                // Returns self
                return self;
            }
            // Event name
        var eventName = (self.options.mode !== 'pushState' && self.options.env !== 'server') ? 'hashchange' : 'navigate';
        // Invoke when route is defined, and once again when app navigates
        return invoke().on(eventName, invoke);
    };
    /**
     * Fire an event listener
     *
     * @param {String} event name
     * @param {Mixed} [attributes] Parameters that will be applied to event handler
     * @return {self} Router
     */
    Grapnel.prototype.trigger = function(event) {
        var self = this,
            params = Array.prototype.slice.call(arguments, 1);
        // Call matching events
        if (this.events[event]) {
            Grapnel._forEach(this.events[event], function(fn) {
                fn.apply(self, params);
            });
        }

        return this;
    };
    /**
     * Add an event listener
     *
     * @param {String} event name (multiple events can be called when separated by a space " ")
     * @param {Function} callback
     * @return {self} Router
     */
    Grapnel.prototype.on = Grapnel.prototype.bind = function(event, handler) {
        var self = this,
            events = event.split(' ');

        Grapnel._forEach(events, function(event) {
            if (self.events[event]) {
                self.events[event].push(handler);
            } else {
                self.events[event] = [handler];
            }
        });

        return this;
    };
    /**
     * Allow event to be called only once
     *
     * @param {String} event name(s)
     * @param {Function} callback
     * @return {self} Router
     */
    Grapnel.prototype.once = function(event, handler) {
        var ran = false;

        return this.on(event, function() {
            if (ran) return false;
            ran = true;
            handler.apply(this, arguments);
            handler = null;
            return true;
        });
    };
    /**
     * @param {String} Route context (without trailing slash)
     * @param {[Function]} Middleware (optional)
     * @return {Function} Adds route to context
     */
    Grapnel.prototype.context = function(context) {
        var self = this,
            middleware = Array.prototype.slice.call(arguments, 1);

        return function() {
            var value = arguments[0],
                submiddleware = (arguments.length > 2) ? Array.prototype.slice.call(arguments, 1, -1) : [],
                handler = Array.prototype.slice.call(arguments, -1)[0],
                prefix = (context.slice(-1) !== '/' && value !== '/' && value !== '') ? context + '/' : context,
                path = (value.substr(0, 1) !== '/') ? value : value.substr(1),
                pattern = prefix + path;

            return self.add.apply(self, [pattern].concat(middleware).concat(submiddleware).concat([handler]));
        }
    };
    /**
     * Navigate through history API
     *
     * @param {String} Pathname
     * @return {self} Router
     */
    Grapnel.prototype.navigate = function(path) {
        return this.path(path).trigger('navigate');
    };

    Grapnel.prototype.path = function(pathname) {
        var self = this,
            frag;

        if ('string' === typeof pathname) {
            // Set path
            if (self.options.mode === 'pushState') {
                frag = (self.options.root) ? (self.options.root + pathname) : pathname;
                root.history.pushState({}, null, frag);
            } else if (root.location) {
                root.location.hash = (self.options.hashBang ? '!' : '') + pathname;
            } else {
                root._pathname = pathname || '';
            }

            return this;
        } else if ('undefined' === typeof pathname) {
            // Get path
            if (self.options.mode === 'pushState') {
                frag = root.location.pathname.replace(self.options.root, '');
            } else if (self.options.mode !== 'pushState' && root.location) {
                frag = (root.location.hash) ? root.location.hash.split((self.options.hashBang ? '#!' : '#'))[1] : '';
            } else {
                frag = root._pathname || '';
            }

            return frag;
        } else if (pathname === false) {
            // Clear path
            if (self.options.mode === 'pushState') {
                root.history.pushState({}, null, self.options.root || '/');
            } else if (root.location) {
                root.location.hash = (self.options.hashBang) ? '!' : '';
            }

            return self;
        }
    };
    /**
     * Create routes based on an object
     *
     * @param {Object} [Options, Routes]
     * @param {Object Routes}
     * @return {self} Router
     */
    Grapnel.listen = function() {
        var opts, routes;
        if (arguments[0] && arguments[1]) {
            opts = arguments[0];
            routes = arguments[1];
        } else {
            routes = arguments[0];
        }
        // Return a new Grapnel instance
        return (function() {
            // TODO: Accept multi-level routes
            for (var key in routes) {
                this.add.call(this, key, routes[key]);
            }

            return this;
        }).call(new Grapnel(opts || {}));
    };
    /**
     * Create a call stack that can be enqueued by handlers and middleware
     *
     * @param {Object} Router
     * @param {Object} Extend
     * @return {self} CallStack
     */
    function CallStack(router, extendObj) {
        this.stack = CallStack.constructor.globalStack.slice(0);
        this.router = router;
        this.runCallback = true;
        this.callbackRan = false;
        this.propagateEvent = true;
        this.value = router.path();

        for (var key in extendObj) {
            this[key] = extendObj[key];
        }

        return this;
    };
    /**
     * Build request parameters and allow them to be checked against a string (usually the current path)
     *
     * @param {String} Route
     * @return {self} Request 
     */
    function Request(route) {
        this.route = route;
        this.keys = [];
        this.regex = Grapnel.regexRoute(route, this.keys);
    };
    // This allows global middleware
    CallStack.constructor.globalStack = [];
    /**
     * Prevent a callback from being called
     *
     * @return {self} CallStack 
     */
    CallStack.prototype.preventDefault = function() {
        this.runCallback = false;
    };
    /**
     * Prevent any future callbacks from being called
     *
     * @return {self} CallStack 
     */
    CallStack.prototype.stopPropagation = function() {
        this.propagateEvent = false;
    };
    /**
     * Get parent state
     *
     * @return {Object} Previous state 
     */
    CallStack.prototype.parent = function() {
        var hasParentEvents = !!(this.previousState && this.previousState.value && this.previousState.value == this.value);
        return (hasParentEvents) ? this.previousState : false;
    };
    /**
     * Run a callback (calls to next)
     *
     * @return {self} CallStack 
     */
    CallStack.prototype.callback = function() {
        this.callbackRan = true;
        this.timeStamp = Date.now();
        this.next();
    };
    /**
     * Add handler or middleware to the stack
     *
     * @param {Function|Array} Handler or a array of handlers
     * @param {Int} Index to start inserting
     * @return {self} CallStack 
     */
    CallStack.prototype.enqueue = function(handler, atIndex) {
        var handlers = (!Array.isArray(handler)) ? [handler] : ((atIndex < handler.length) ? handler.reverse() : handler);

        while (handlers.length) {
            this.stack.splice(atIndex || this.stack.length + 1, 0, handlers.shift());
        }

        return this;
    };
    /**
     * Call to next item in stack -- this adds the `req`, `event`, and `next()` arguments to all middleware
     *
     * @return {self} CallStack 
     */
    CallStack.prototype.next = function() {
        var self = this;

        return this.stack.shift().call(this.router, this.req, this, function next() {
            self.next.call(self);
        });
    };
    /**
     * Match a path string -- returns a request object if there is a match -- returns false otherwise
     *
     * @return {Object} req
     */
    Request.prototype.parse = function(path) {
        var match = path.match(this.regex),
            self = this;

        var req = {
            params: {},
            keys: this.keys,
            matches: (match || []).slice(1),
            match: match
        };
        // Build parameters
        Grapnel._forEach(req.matches, function(value, i) {
            var key = (self.keys[i] && self.keys[i].name) ? self.keys[i].name : i;
            // Parameter key will be its key or the iteration index. This is useful if a wildcard (*) is matched
            req.params[key] = (value) ? decodeURIComponent(value) : undefined;
        });

        return req;
    };

    // Append utility constructors to Grapnel
    Grapnel.CallStack = CallStack;
    Grapnel.Request = Request;

    if ('function' === typeof root.define && !root.define.amd.grapnel) {
        root.define(function(require, exports, module) {
            root.define.amd.grapnel = true;
            return Grapnel;
        });
    } else if ('object' === typeof module && 'object' === typeof module.exports) {
        module.exports = exports = Grapnel;
    } else {
        root.Grapnel = Grapnel;
    }

}).call({}, ('object' === typeof window) ? window : this);

}).call(this,require('_process'))
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9ncmFwbmVsL3NyYy9ncmFwbmVsLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIvKioqKlxuICogR3JhcG5lbFxuICogaHR0cHM6Ly9naXRodWIuY29tL2J5dGVjaXBoZXIvZ3JhcG5lbFxuICpcbiAqIEBhdXRob3IgR3JlZyBTYWJpYSBUdWNrZXIgPGdyZWdAYnl0ZWNpcGhlci5pbz5cbiAqIEBsaW5rIGh0dHA6Ly9ieXRlY2lwaGVyLmlvXG4gKiBAdmVyc2lvbiAwLjYuMlxuICpcbiAqIFJlbGVhc2VkIHVuZGVyIE1JVCBMaWNlbnNlLiBTZWUgTElDRU5TRS50eHQgb3IgaHR0cDovL29wZW5zb3VyY2Uub3JnL2xpY2Vuc2VzL01JVFxuKi9cblxuIShmdW5jdGlvbihyb290KSB7XG5cbiAgICBmdW5jdGlvbiBHcmFwbmVsKG9wdHMpIHtcbiAgICAgICAgXCJ1c2Ugc3RyaWN0XCI7XG5cbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzOyAvLyBTY29wZSByZWZlcmVuY2VcbiAgICAgICAgdGhpcy5ldmVudHMgPSB7fTsgLy8gRXZlbnQgTGlzdGVuZXJzXG4gICAgICAgIHRoaXMuc3RhdGUgPSBudWxsOyAvLyBSb3V0ZXIgc3RhdGUgb2JqZWN0XG4gICAgICAgIHRoaXMub3B0aW9ucyA9IG9wdHMgfHwge307IC8vIE9wdGlvbnNcbiAgICAgICAgdGhpcy5vcHRpb25zLmVudiA9IHRoaXMub3B0aW9ucy5lbnYgfHwgKCEhKE9iamVjdC5rZXlzKHJvb3QpLmxlbmd0aCA9PT0gMCAmJiBwcm9jZXNzICYmIHByb2Nlc3MuYnJvd3NlciAhPT0gdHJ1ZSkgPyAnc2VydmVyJyA6ICdjbGllbnQnKTtcbiAgICAgICAgdGhpcy5vcHRpb25zLm1vZGUgPSB0aGlzLm9wdGlvbnMubW9kZSB8fCAoISEodGhpcy5vcHRpb25zLmVudiAhPT0gJ3NlcnZlcicgJiYgdGhpcy5vcHRpb25zLnB1c2hTdGF0ZSAmJiByb290Lmhpc3RvcnkgJiYgcm9vdC5oaXN0b3J5LnB1c2hTdGF0ZSkgPyAncHVzaFN0YXRlJyA6ICdoYXNoY2hhbmdlJyk7XG4gICAgICAgIHRoaXMudmVyc2lvbiA9ICcwLjYuMic7IC8vIFZlcnNpb25cblxuICAgICAgICBpZiAoJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIHJvb3QuYWRkRXZlbnRMaXN0ZW5lcikge1xuICAgICAgICAgICAgcm9vdC5hZGRFdmVudExpc3RlbmVyKCdoYXNoY2hhbmdlJywgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgc2VsZi50cmlnZ2VyKCdoYXNoY2hhbmdlJyk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgcm9vdC5hZGRFdmVudExpc3RlbmVyKCdwb3BzdGF0ZScsIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgICAgICAvLyBNYWtlIHN1cmUgcG9wc3RhdGUgZG9lc24ndCBydW4gb24gaW5pdCAtLSB0aGlzIGlzIGEgY29tbW9uIGlzc3VlIHdpdGggU2FmYXJpIGFuZCBvbGQgdmVyc2lvbnMgb2YgQ2hyb21lXG4gICAgICAgICAgICAgICAgaWYgKHNlbGYuc3RhdGUgJiYgc2VsZi5zdGF0ZS5wcmV2aW91c1N0YXRlID09PSBudWxsKSByZXR1cm4gZmFsc2U7XG5cbiAgICAgICAgICAgICAgICBzZWxmLnRyaWdnZXIoJ25hdmlnYXRlJyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogQ3JlYXRlIGEgUmVnRXhwIFJvdXRlIGZyb20gYSBzdHJpbmdcbiAgICAgKiBUaGlzIGlzIHRoZSBoZWFydCBvZiB0aGUgcm91dGVyIGFuZCBJJ3ZlIG1hZGUgaXQgYXMgc21hbGwgYXMgcG9zc2libGUhXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gUGF0aCBvZiByb3V0ZVxuICAgICAqIEBwYXJhbSB7QXJyYXl9IEFycmF5IG9mIGtleXMgdG8gZmlsbFxuICAgICAqIEBwYXJhbSB7Qm9vbH0gQ2FzZSBzZW5zaXRpdmUgY29tcGFyaXNvblxuICAgICAqIEBwYXJhbSB7Qm9vbH0gU3RyaWN0IG1vZGVcbiAgICAgKi9cbiAgICBHcmFwbmVsLnJlZ2V4Um91dGUgPSBmdW5jdGlvbihwYXRoLCBrZXlzLCBzZW5zaXRpdmUsIHN0cmljdCkge1xuICAgICAgICBpZiAocGF0aCBpbnN0YW5jZW9mIFJlZ0V4cCkgcmV0dXJuIHBhdGg7XG4gICAgICAgIGlmIChwYXRoIGluc3RhbmNlb2YgQXJyYXkpIHBhdGggPSAnKCcgKyBwYXRoLmpvaW4oJ3wnKSArICcpJztcbiAgICAgICAgLy8gQnVpbGQgcm91dGUgUmVnRXhwXG4gICAgICAgIHBhdGggPSBwYXRoLmNvbmNhdChzdHJpY3QgPyAnJyA6ICcvPycpXG4gICAgICAgICAgICAucmVwbGFjZSgvXFwvXFwoL2csICcoPzovJylcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXCsvZywgJ19fcGx1c19fJylcbiAgICAgICAgICAgIC5yZXBsYWNlKC8oXFwvKT8oXFwuKT86KFxcdyspKD86KFxcKC4qP1xcKSkpPyhcXD8pPy9nLCBmdW5jdGlvbihfLCBzbGFzaCwgZm9ybWF0LCBrZXksIGNhcHR1cmUsIG9wdGlvbmFsKSB7XG4gICAgICAgICAgICAgICAga2V5cy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgbmFtZToga2V5LFxuICAgICAgICAgICAgICAgICAgICBvcHRpb25hbDogISFvcHRpb25hbFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHNsYXNoID0gc2xhc2ggfHwgJyc7XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gJycgKyAob3B0aW9uYWwgPyAnJyA6IHNsYXNoKSArICcoPzonICsgKG9wdGlvbmFsID8gc2xhc2ggOiAnJykgKyAoZm9ybWF0IHx8ICcnKSArIChjYXB0dXJlIHx8IChmb3JtYXQgJiYgJyhbXi8uXSs/KScgfHwgJyhbXi9dKz8pJykpICsgJyknICsgKG9wdGlvbmFsIHx8ICcnKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAucmVwbGFjZSgvKFtcXC8uXSkvZywgJ1xcXFwkMScpXG4gICAgICAgICAgICAucmVwbGFjZSgvX19wbHVzX18vZywgJyguKyknKVxuICAgICAgICAgICAgLnJlcGxhY2UoL1xcKi9nLCAnKC4qKScpO1xuXG4gICAgICAgIHJldHVybiBuZXcgUmVnRXhwKCdeJyArIHBhdGggKyAnJCcsIHNlbnNpdGl2ZSA/ICcnIDogJ2knKTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIEZvckVhY2ggd29ya2Fyb3VuZCB1dGlsaXR5XG4gICAgICpcbiAgICAgKiBAcGFyYW0ge0FycmF5fSB0byBpdGVyYXRlXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2tcbiAgICAgKi9cbiAgICBHcmFwbmVsLl9mb3JFYWNoID0gZnVuY3Rpb24oYSwgY2FsbGJhY2spIHtcbiAgICAgICAgaWYgKHR5cGVvZiBBcnJheS5wcm90b3R5cGUuZm9yRWFjaCA9PT0gJ2Z1bmN0aW9uJykgcmV0dXJuIEFycmF5LnByb3RvdHlwZS5mb3JFYWNoLmNhbGwoYSwgY2FsbGJhY2spO1xuICAgICAgICAvLyBSZXBsaWNhdGUgZm9yRWFjaCgpXG4gICAgICAgIHJldHVybiBmdW5jdGlvbihjLCBuZXh0KSB7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMCwgbiA9IHRoaXMubGVuZ3RoOyBpIDwgbjsgKytpKSB7XG4gICAgICAgICAgICAgICAgYy5jYWxsKG5leHQsIHRoaXNbaV0sIGksIHRoaXMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LmNhbGwoYSwgY2FsbGJhY2spO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogQWRkIGFuIHJvdXRlIGFuZCBoYW5kbGVyXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1N0cmluZ3xSZWdFeHB9IHJvdXRlIG5hbWVcbiAgICAgKiBAcmV0dXJuIHtzZWxmfSBSb3V0ZXJcbiAgICAgKi9cbiAgICBHcmFwbmVsLnByb3RvdHlwZS5nZXQgPSBHcmFwbmVsLnByb3RvdHlwZS5hZGQgPSBmdW5jdGlvbihyb3V0ZSkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXMsXG4gICAgICAgICAgICBtaWRkbGV3YXJlID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxLCAtMSksXG4gICAgICAgICAgICBoYW5kbGVyID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAtMSlbMF0sXG4gICAgICAgICAgICByZXF1ZXN0ID0gbmV3IFJlcXVlc3Qocm91dGUpO1xuXG4gICAgICAgIHZhciBpbnZva2UgPSBmdW5jdGlvbiBSb3V0ZUhhbmRsZXIoKSB7XG4gICAgICAgICAgICAgICAgLy8gQnVpbGQgcmVxdWVzdCBwYXJhbWV0ZXJzXG4gICAgICAgICAgICAgICAgdmFyIHJlcSA9IHJlcXVlc3QucGFyc2Uoc2VsZi5wYXRoKCkpO1xuICAgICAgICAgICAgICAgIC8vIENoZWNrIGlmIG1hdGNoZXMgYXJlIGZvdW5kXG4gICAgICAgICAgICAgICAgaWYgKHJlcS5tYXRjaCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBNYXRjaCBmb3VuZFxuICAgICAgICAgICAgICAgICAgICB2YXIgZXh0cmEgPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByb3V0ZTogcm91dGUsXG4gICAgICAgICAgICAgICAgICAgICAgICBwYXJhbXM6IHJlcS5wYXJhbXMsXG4gICAgICAgICAgICAgICAgICAgICAgICByZXE6IHJlcSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlZ2V4OiByZXEubWF0Y2hcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgLy8gQ3JlYXRlIGNhbGwgc3RhY2sgLS0gYWRkIG1pZGRsZXdhcmUgZmlyc3QsIHRoZW4gaGFuZGxlclxuICAgICAgICAgICAgICAgICAgICB2YXIgc3RhY2sgPSBuZXcgQ2FsbFN0YWNrKHNlbGYsIGV4dHJhKS5lbnF1ZXVlKG1pZGRsZXdhcmUuY29uY2F0KGhhbmRsZXIpKTtcbiAgICAgICAgICAgICAgICAgICAgLy8gVHJpZ2dlciBtYWluIGV2ZW50XG4gICAgICAgICAgICAgICAgICAgIHNlbGYudHJpZ2dlcignbWF0Y2gnLCBzdGFjaywgcmVxKTtcbiAgICAgICAgICAgICAgICAgICAgLy8gQ29udGludWU/XG4gICAgICAgICAgICAgICAgICAgIGlmICghc3RhY2sucnVuQ2FsbGJhY2spIHJldHVybiBzZWxmO1xuICAgICAgICAgICAgICAgICAgICAvLyBQcmV2aW91cyBzdGF0ZSBiZWNvbWVzIGN1cnJlbnQgc3RhdGVcbiAgICAgICAgICAgICAgICAgICAgc3RhY2sucHJldmlvdXNTdGF0ZSA9IHNlbGYuc3RhdGU7XG4gICAgICAgICAgICAgICAgICAgIC8vIFNhdmUgbmV3IHN0YXRlXG4gICAgICAgICAgICAgICAgICAgIHNlbGYuc3RhdGUgPSBzdGFjaztcbiAgICAgICAgICAgICAgICAgICAgLy8gUHJldmVudCB0aGlzIGhhbmRsZXIgZnJvbSBiZWluZyBjYWxsZWQgaWYgcGFyZW50IGhhbmRsZXIgaW4gc3RhY2sgaGFzIGluc3RydWN0ZWQgbm90IHRvIHByb3BhZ2F0ZSBhbnkgbW9yZSBldmVudHNcbiAgICAgICAgICAgICAgICAgICAgaWYgKHN0YWNrLnBhcmVudCgpICYmIHN0YWNrLnBhcmVudCgpLnByb3BhZ2F0ZUV2ZW50ID09PSBmYWxzZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3RhY2sucHJvcGFnYXRlRXZlbnQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBzZWxmO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIC8vIENhbGwgaGFuZGxlclxuICAgICAgICAgICAgICAgICAgICBzdGFjay5jYWxsYmFjaygpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAvLyBSZXR1cm5zIHNlbGZcbiAgICAgICAgICAgICAgICByZXR1cm4gc2VsZjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIEV2ZW50IG5hbWVcbiAgICAgICAgdmFyIGV2ZW50TmFtZSA9IChzZWxmLm9wdGlvbnMubW9kZSAhPT0gJ3B1c2hTdGF0ZScgJiYgc2VsZi5vcHRpb25zLmVudiAhPT0gJ3NlcnZlcicpID8gJ2hhc2hjaGFuZ2UnIDogJ25hdmlnYXRlJztcbiAgICAgICAgLy8gSW52b2tlIHdoZW4gcm91dGUgaXMgZGVmaW5lZCwgYW5kIG9uY2UgYWdhaW4gd2hlbiBhcHAgbmF2aWdhdGVzXG4gICAgICAgIHJldHVybiBpbnZva2UoKS5vbihldmVudE5hbWUsIGludm9rZSk7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBGaXJlIGFuIGV2ZW50IGxpc3RlbmVyXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gZXZlbnQgbmFtZVxuICAgICAqIEBwYXJhbSB7TWl4ZWR9IFthdHRyaWJ1dGVzXSBQYXJhbWV0ZXJzIHRoYXQgd2lsbCBiZSBhcHBsaWVkIHRvIGV2ZW50IGhhbmRsZXJcbiAgICAgKiBAcmV0dXJuIHtzZWxmfSBSb3V0ZXJcbiAgICAgKi9cbiAgICBHcmFwbmVsLnByb3RvdHlwZS50cmlnZ2VyID0gZnVuY3Rpb24oZXZlbnQpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzLFxuICAgICAgICAgICAgcGFyYW1zID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcbiAgICAgICAgLy8gQ2FsbCBtYXRjaGluZyBldmVudHNcbiAgICAgICAgaWYgKHRoaXMuZXZlbnRzW2V2ZW50XSkge1xuICAgICAgICAgICAgR3JhcG5lbC5fZm9yRWFjaCh0aGlzLmV2ZW50c1tldmVudF0sIGZ1bmN0aW9uKGZuKSB7XG4gICAgICAgICAgICAgICAgZm4uYXBwbHkoc2VsZiwgcGFyYW1zKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBBZGQgYW4gZXZlbnQgbGlzdGVuZXJcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBldmVudCBuYW1lIChtdWx0aXBsZSBldmVudHMgY2FuIGJlIGNhbGxlZCB3aGVuIHNlcGFyYXRlZCBieSBhIHNwYWNlIFwiIFwiKVxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrXG4gICAgICogQHJldHVybiB7c2VsZn0gUm91dGVyXG4gICAgICovXG4gICAgR3JhcG5lbC5wcm90b3R5cGUub24gPSBHcmFwbmVsLnByb3RvdHlwZS5iaW5kID0gZnVuY3Rpb24oZXZlbnQsIGhhbmRsZXIpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzLFxuICAgICAgICAgICAgZXZlbnRzID0gZXZlbnQuc3BsaXQoJyAnKTtcblxuICAgICAgICBHcmFwbmVsLl9mb3JFYWNoKGV2ZW50cywgZnVuY3Rpb24oZXZlbnQpIHtcbiAgICAgICAgICAgIGlmIChzZWxmLmV2ZW50c1tldmVudF0pIHtcbiAgICAgICAgICAgICAgICBzZWxmLmV2ZW50c1tldmVudF0ucHVzaChoYW5kbGVyKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgc2VsZi5ldmVudHNbZXZlbnRdID0gW2hhbmRsZXJdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIEFsbG93IGV2ZW50IHRvIGJlIGNhbGxlZCBvbmx5IG9uY2VcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBldmVudCBuYW1lKHMpXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2tcbiAgICAgKiBAcmV0dXJuIHtzZWxmfSBSb3V0ZXJcbiAgICAgKi9cbiAgICBHcmFwbmVsLnByb3RvdHlwZS5vbmNlID0gZnVuY3Rpb24oZXZlbnQsIGhhbmRsZXIpIHtcbiAgICAgICAgdmFyIHJhbiA9IGZhbHNlO1xuXG4gICAgICAgIHJldHVybiB0aGlzLm9uKGV2ZW50LCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGlmIChyYW4pIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIHJhbiA9IHRydWU7XG4gICAgICAgICAgICBoYW5kbGVyLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICAgICAgICBoYW5kbGVyID0gbnVsbDtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9KTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBSb3V0ZSBjb250ZXh0ICh3aXRob3V0IHRyYWlsaW5nIHNsYXNoKVxuICAgICAqIEBwYXJhbSB7W0Z1bmN0aW9uXX0gTWlkZGxld2FyZSAob3B0aW9uYWwpXG4gICAgICogQHJldHVybiB7RnVuY3Rpb259IEFkZHMgcm91dGUgdG8gY29udGV4dFxuICAgICAqL1xuICAgIEdyYXBuZWwucHJvdG90eXBlLmNvbnRleHQgPSBmdW5jdGlvbihjb250ZXh0KSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcyxcbiAgICAgICAgICAgIG1pZGRsZXdhcmUgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuXG4gICAgICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHZhciB2YWx1ZSA9IGFyZ3VtZW50c1swXSxcbiAgICAgICAgICAgICAgICBzdWJtaWRkbGV3YXJlID0gKGFyZ3VtZW50cy5sZW5ndGggPiAyKSA/IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSwgLTEpIDogW10sXG4gICAgICAgICAgICAgICAgaGFuZGxlciA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgLTEpWzBdLFxuICAgICAgICAgICAgICAgIHByZWZpeCA9IChjb250ZXh0LnNsaWNlKC0xKSAhPT0gJy8nICYmIHZhbHVlICE9PSAnLycgJiYgdmFsdWUgIT09ICcnKSA/IGNvbnRleHQgKyAnLycgOiBjb250ZXh0LFxuICAgICAgICAgICAgICAgIHBhdGggPSAodmFsdWUuc3Vic3RyKDAsIDEpICE9PSAnLycpID8gdmFsdWUgOiB2YWx1ZS5zdWJzdHIoMSksXG4gICAgICAgICAgICAgICAgcGF0dGVybiA9IHByZWZpeCArIHBhdGg7XG5cbiAgICAgICAgICAgIHJldHVybiBzZWxmLmFkZC5hcHBseShzZWxmLCBbcGF0dGVybl0uY29uY2F0KG1pZGRsZXdhcmUpLmNvbmNhdChzdWJtaWRkbGV3YXJlKS5jb25jYXQoW2hhbmRsZXJdKSk7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIC8qKlxuICAgICAqIE5hdmlnYXRlIHRocm91Z2ggaGlzdG9yeSBBUElcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBQYXRobmFtZVxuICAgICAqIEByZXR1cm4ge3NlbGZ9IFJvdXRlclxuICAgICAqL1xuICAgIEdyYXBuZWwucHJvdG90eXBlLm5hdmlnYXRlID0gZnVuY3Rpb24ocGF0aCkge1xuICAgICAgICByZXR1cm4gdGhpcy5wYXRoKHBhdGgpLnRyaWdnZXIoJ25hdmlnYXRlJyk7XG4gICAgfTtcblxuICAgIEdyYXBuZWwucHJvdG90eXBlLnBhdGggPSBmdW5jdGlvbihwYXRobmFtZSkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXMsXG4gICAgICAgICAgICBmcmFnO1xuXG4gICAgICAgIGlmICgnc3RyaW5nJyA9PT0gdHlwZW9mIHBhdGhuYW1lKSB7XG4gICAgICAgICAgICAvLyBTZXQgcGF0aFxuICAgICAgICAgICAgaWYgKHNlbGYub3B0aW9ucy5tb2RlID09PSAncHVzaFN0YXRlJykge1xuICAgICAgICAgICAgICAgIGZyYWcgPSAoc2VsZi5vcHRpb25zLnJvb3QpID8gKHNlbGYub3B0aW9ucy5yb290ICsgcGF0aG5hbWUpIDogcGF0aG5hbWU7XG4gICAgICAgICAgICAgICAgcm9vdC5oaXN0b3J5LnB1c2hTdGF0ZSh7fSwgbnVsbCwgZnJhZyk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHJvb3QubG9jYXRpb24pIHtcbiAgICAgICAgICAgICAgICByb290LmxvY2F0aW9uLmhhc2ggPSAoc2VsZi5vcHRpb25zLmhhc2hCYW5nID8gJyEnIDogJycpICsgcGF0aG5hbWU7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJvb3QuX3BhdGhuYW1lID0gcGF0aG5hbWUgfHwgJyc7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICB9IGVsc2UgaWYgKCd1bmRlZmluZWQnID09PSB0eXBlb2YgcGF0aG5hbWUpIHtcbiAgICAgICAgICAgIC8vIEdldCBwYXRoXG4gICAgICAgICAgICBpZiAoc2VsZi5vcHRpb25zLm1vZGUgPT09ICdwdXNoU3RhdGUnKSB7XG4gICAgICAgICAgICAgICAgZnJhZyA9IHJvb3QubG9jYXRpb24ucGF0aG5hbWUucmVwbGFjZShzZWxmLm9wdGlvbnMucm9vdCwgJycpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChzZWxmLm9wdGlvbnMubW9kZSAhPT0gJ3B1c2hTdGF0ZScgJiYgcm9vdC5sb2NhdGlvbikge1xuICAgICAgICAgICAgICAgIGZyYWcgPSAocm9vdC5sb2NhdGlvbi5oYXNoKSA/IHJvb3QubG9jYXRpb24uaGFzaC5zcGxpdCgoc2VsZi5vcHRpb25zLmhhc2hCYW5nID8gJyMhJyA6ICcjJykpWzFdIDogJyc7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGZyYWcgPSByb290Ll9wYXRobmFtZSB8fCAnJztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIGZyYWc7XG4gICAgICAgIH0gZWxzZSBpZiAocGF0aG5hbWUgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICAvLyBDbGVhciBwYXRoXG4gICAgICAgICAgICBpZiAoc2VsZi5vcHRpb25zLm1vZGUgPT09ICdwdXNoU3RhdGUnKSB7XG4gICAgICAgICAgICAgICAgcm9vdC5oaXN0b3J5LnB1c2hTdGF0ZSh7fSwgbnVsbCwgc2VsZi5vcHRpb25zLnJvb3QgfHwgJy8nKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocm9vdC5sb2NhdGlvbikge1xuICAgICAgICAgICAgICAgIHJvb3QubG9jYXRpb24uaGFzaCA9IChzZWxmLm9wdGlvbnMuaGFzaEJhbmcpID8gJyEnIDogJyc7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBzZWxmO1xuICAgICAgICB9XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBDcmVhdGUgcm91dGVzIGJhc2VkIG9uIGFuIG9iamVjdFxuICAgICAqXG4gICAgICogQHBhcmFtIHtPYmplY3R9IFtPcHRpb25zLCBSb3V0ZXNdXG4gICAgICogQHBhcmFtIHtPYmplY3QgUm91dGVzfVxuICAgICAqIEByZXR1cm4ge3NlbGZ9IFJvdXRlclxuICAgICAqL1xuICAgIEdyYXBuZWwubGlzdGVuID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBvcHRzLCByb3V0ZXM7XG4gICAgICAgIGlmIChhcmd1bWVudHNbMF0gJiYgYXJndW1lbnRzWzFdKSB7XG4gICAgICAgICAgICBvcHRzID0gYXJndW1lbnRzWzBdO1xuICAgICAgICAgICAgcm91dGVzID0gYXJndW1lbnRzWzFdO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcm91dGVzID0gYXJndW1lbnRzWzBdO1xuICAgICAgICB9XG4gICAgICAgIC8vIFJldHVybiBhIG5ldyBHcmFwbmVsIGluc3RhbmNlXG4gICAgICAgIHJldHVybiAoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAvLyBUT0RPOiBBY2NlcHQgbXVsdGktbGV2ZWwgcm91dGVzXG4gICAgICAgICAgICBmb3IgKHZhciBrZXkgaW4gcm91dGVzKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5hZGQuY2FsbCh0aGlzLCBrZXksIHJvdXRlc1trZXldKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH0pLmNhbGwobmV3IEdyYXBuZWwob3B0cyB8fCB7fSkpO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogQ3JlYXRlIGEgY2FsbCBzdGFjayB0aGF0IGNhbiBiZSBlbnF1ZXVlZCBieSBoYW5kbGVycyBhbmQgbWlkZGxld2FyZVxuICAgICAqXG4gICAgICogQHBhcmFtIHtPYmplY3R9IFJvdXRlclxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBFeHRlbmRcbiAgICAgKiBAcmV0dXJuIHtzZWxmfSBDYWxsU3RhY2tcbiAgICAgKi9cbiAgICBmdW5jdGlvbiBDYWxsU3RhY2socm91dGVyLCBleHRlbmRPYmopIHtcbiAgICAgICAgdGhpcy5zdGFjayA9IENhbGxTdGFjay5jb25zdHJ1Y3Rvci5nbG9iYWxTdGFjay5zbGljZSgwKTtcbiAgICAgICAgdGhpcy5yb3V0ZXIgPSByb3V0ZXI7XG4gICAgICAgIHRoaXMucnVuQ2FsbGJhY2sgPSB0cnVlO1xuICAgICAgICB0aGlzLmNhbGxiYWNrUmFuID0gZmFsc2U7XG4gICAgICAgIHRoaXMucHJvcGFnYXRlRXZlbnQgPSB0cnVlO1xuICAgICAgICB0aGlzLnZhbHVlID0gcm91dGVyLnBhdGgoKTtcblxuICAgICAgICBmb3IgKHZhciBrZXkgaW4gZXh0ZW5kT2JqKSB7XG4gICAgICAgICAgICB0aGlzW2tleV0gPSBleHRlbmRPYmpba2V5XTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogQnVpbGQgcmVxdWVzdCBwYXJhbWV0ZXJzIGFuZCBhbGxvdyB0aGVtIHRvIGJlIGNoZWNrZWQgYWdhaW5zdCBhIHN0cmluZyAodXN1YWxseSB0aGUgY3VycmVudCBwYXRoKVxuICAgICAqXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IFJvdXRlXG4gICAgICogQHJldHVybiB7c2VsZn0gUmVxdWVzdCBcbiAgICAgKi9cbiAgICBmdW5jdGlvbiBSZXF1ZXN0KHJvdXRlKSB7XG4gICAgICAgIHRoaXMucm91dGUgPSByb3V0ZTtcbiAgICAgICAgdGhpcy5rZXlzID0gW107XG4gICAgICAgIHRoaXMucmVnZXggPSBHcmFwbmVsLnJlZ2V4Um91dGUocm91dGUsIHRoaXMua2V5cyk7XG4gICAgfTtcbiAgICAvLyBUaGlzIGFsbG93cyBnbG9iYWwgbWlkZGxld2FyZVxuICAgIENhbGxTdGFjay5jb25zdHJ1Y3Rvci5nbG9iYWxTdGFjayA9IFtdO1xuICAgIC8qKlxuICAgICAqIFByZXZlbnQgYSBjYWxsYmFjayBmcm9tIGJlaW5nIGNhbGxlZFxuICAgICAqXG4gICAgICogQHJldHVybiB7c2VsZn0gQ2FsbFN0YWNrIFxuICAgICAqL1xuICAgIENhbGxTdGFjay5wcm90b3R5cGUucHJldmVudERlZmF1bHQgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgdGhpcy5ydW5DYWxsYmFjayA9IGZhbHNlO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogUHJldmVudCBhbnkgZnV0dXJlIGNhbGxiYWNrcyBmcm9tIGJlaW5nIGNhbGxlZFxuICAgICAqXG4gICAgICogQHJldHVybiB7c2VsZn0gQ2FsbFN0YWNrIFxuICAgICAqL1xuICAgIENhbGxTdGFjay5wcm90b3R5cGUuc3RvcFByb3BhZ2F0aW9uID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHRoaXMucHJvcGFnYXRlRXZlbnQgPSBmYWxzZTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIEdldCBwYXJlbnQgc3RhdGVcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge09iamVjdH0gUHJldmlvdXMgc3RhdGUgXG4gICAgICovXG4gICAgQ2FsbFN0YWNrLnByb3RvdHlwZS5wYXJlbnQgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIGhhc1BhcmVudEV2ZW50cyA9ICEhKHRoaXMucHJldmlvdXNTdGF0ZSAmJiB0aGlzLnByZXZpb3VzU3RhdGUudmFsdWUgJiYgdGhpcy5wcmV2aW91c1N0YXRlLnZhbHVlID09IHRoaXMudmFsdWUpO1xuICAgICAgICByZXR1cm4gKGhhc1BhcmVudEV2ZW50cykgPyB0aGlzLnByZXZpb3VzU3RhdGUgOiBmYWxzZTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIFJ1biBhIGNhbGxiYWNrIChjYWxscyB0byBuZXh0KVxuICAgICAqXG4gICAgICogQHJldHVybiB7c2VsZn0gQ2FsbFN0YWNrIFxuICAgICAqL1xuICAgIENhbGxTdGFjay5wcm90b3R5cGUuY2FsbGJhY2sgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgdGhpcy5jYWxsYmFja1JhbiA9IHRydWU7XG4gICAgICAgIHRoaXMudGltZVN0YW1wID0gRGF0ZS5ub3coKTtcbiAgICAgICAgdGhpcy5uZXh0KCk7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBBZGQgaGFuZGxlciBvciBtaWRkbGV3YXJlIHRvIHRoZSBzdGFja1xuICAgICAqXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbnxBcnJheX0gSGFuZGxlciBvciBhIGFycmF5IG9mIGhhbmRsZXJzXG4gICAgICogQHBhcmFtIHtJbnR9IEluZGV4IHRvIHN0YXJ0IGluc2VydGluZ1xuICAgICAqIEByZXR1cm4ge3NlbGZ9IENhbGxTdGFjayBcbiAgICAgKi9cbiAgICBDYWxsU3RhY2sucHJvdG90eXBlLmVucXVldWUgPSBmdW5jdGlvbihoYW5kbGVyLCBhdEluZGV4KSB7XG4gICAgICAgIHZhciBoYW5kbGVycyA9ICghQXJyYXkuaXNBcnJheShoYW5kbGVyKSkgPyBbaGFuZGxlcl0gOiAoKGF0SW5kZXggPCBoYW5kbGVyLmxlbmd0aCkgPyBoYW5kbGVyLnJldmVyc2UoKSA6IGhhbmRsZXIpO1xuXG4gICAgICAgIHdoaWxlIChoYW5kbGVycy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHRoaXMuc3RhY2suc3BsaWNlKGF0SW5kZXggfHwgdGhpcy5zdGFjay5sZW5ndGggKyAxLCAwLCBoYW5kbGVycy5zaGlmdCgpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogQ2FsbCB0byBuZXh0IGl0ZW0gaW4gc3RhY2sgLS0gdGhpcyBhZGRzIHRoZSBgcmVxYCwgYGV2ZW50YCwgYW5kIGBuZXh0KClgIGFyZ3VtZW50cyB0byBhbGwgbWlkZGxld2FyZVxuICAgICAqXG4gICAgICogQHJldHVybiB7c2VsZn0gQ2FsbFN0YWNrIFxuICAgICAqL1xuICAgIENhbGxTdGFjay5wcm90b3R5cGUubmV4dCA9IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICAgICAgcmV0dXJuIHRoaXMuc3RhY2suc2hpZnQoKS5jYWxsKHRoaXMucm91dGVyLCB0aGlzLnJlcSwgdGhpcywgZnVuY3Rpb24gbmV4dCgpIHtcbiAgICAgICAgICAgIHNlbGYubmV4dC5jYWxsKHNlbGYpO1xuICAgICAgICB9KTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIE1hdGNoIGEgcGF0aCBzdHJpbmcgLS0gcmV0dXJucyBhIHJlcXVlc3Qgb2JqZWN0IGlmIHRoZXJlIGlzIGEgbWF0Y2ggLS0gcmV0dXJucyBmYWxzZSBvdGhlcndpc2VcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge09iamVjdH0gcmVxXG4gICAgICovXG4gICAgUmVxdWVzdC5wcm90b3R5cGUucGFyc2UgPSBmdW5jdGlvbihwYXRoKSB7XG4gICAgICAgIHZhciBtYXRjaCA9IHBhdGgubWF0Y2godGhpcy5yZWdleCksXG4gICAgICAgICAgICBzZWxmID0gdGhpcztcblxuICAgICAgICB2YXIgcmVxID0ge1xuICAgICAgICAgICAgcGFyYW1zOiB7fSxcbiAgICAgICAgICAgIGtleXM6IHRoaXMua2V5cyxcbiAgICAgICAgICAgIG1hdGNoZXM6IChtYXRjaCB8fCBbXSkuc2xpY2UoMSksXG4gICAgICAgICAgICBtYXRjaDogbWF0Y2hcbiAgICAgICAgfTtcbiAgICAgICAgLy8gQnVpbGQgcGFyYW1ldGVyc1xuICAgICAgICBHcmFwbmVsLl9mb3JFYWNoKHJlcS5tYXRjaGVzLCBmdW5jdGlvbih2YWx1ZSwgaSkge1xuICAgICAgICAgICAgdmFyIGtleSA9IChzZWxmLmtleXNbaV0gJiYgc2VsZi5rZXlzW2ldLm5hbWUpID8gc2VsZi5rZXlzW2ldLm5hbWUgOiBpO1xuICAgICAgICAgICAgLy8gUGFyYW1ldGVyIGtleSB3aWxsIGJlIGl0cyBrZXkgb3IgdGhlIGl0ZXJhdGlvbiBpbmRleC4gVGhpcyBpcyB1c2VmdWwgaWYgYSB3aWxkY2FyZCAoKikgaXMgbWF0Y2hlZFxuICAgICAgICAgICAgcmVxLnBhcmFtc1trZXldID0gKHZhbHVlKSA/IGRlY29kZVVSSUNvbXBvbmVudCh2YWx1ZSkgOiB1bmRlZmluZWQ7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiByZXE7XG4gICAgfTtcblxuICAgIC8vIEFwcGVuZCB1dGlsaXR5IGNvbnN0cnVjdG9ycyB0byBHcmFwbmVsXG4gICAgR3JhcG5lbC5DYWxsU3RhY2sgPSBDYWxsU3RhY2s7XG4gICAgR3JhcG5lbC5SZXF1ZXN0ID0gUmVxdWVzdDtcblxuICAgIGlmICgnZnVuY3Rpb24nID09PSB0eXBlb2Ygcm9vdC5kZWZpbmUgJiYgIXJvb3QuZGVmaW5lLmFtZC5ncmFwbmVsKSB7XG4gICAgICAgIHJvb3QuZGVmaW5lKGZ1bmN0aW9uKHJlcXVpcmUsIGV4cG9ydHMsIG1vZHVsZSkge1xuICAgICAgICAgICAgcm9vdC5kZWZpbmUuYW1kLmdyYXBuZWwgPSB0cnVlO1xuICAgICAgICAgICAgcmV0dXJuIEdyYXBuZWw7XG4gICAgICAgIH0pO1xuICAgIH0gZWxzZSBpZiAoJ29iamVjdCcgPT09IHR5cGVvZiBtb2R1bGUgJiYgJ29iamVjdCcgPT09IHR5cGVvZiBtb2R1bGUuZXhwb3J0cykge1xuICAgICAgICBtb2R1bGUuZXhwb3J0cyA9IGV4cG9ydHMgPSBHcmFwbmVsO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJvb3QuR3JhcG5lbCA9IEdyYXBuZWw7XG4gICAgfVxuXG59KS5jYWxsKHt9LCAoJ29iamVjdCcgPT09IHR5cGVvZiB3aW5kb3cpID8gd2luZG93IDogdGhpcyk7XG4iXX0=
},{"_process":2}],2:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};
var queue = [];
var draining = false;

function drainQueue() {
    if (draining) {
        return;
    }
    draining = true;
    var currentQueue;
    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        var i = -1;
        while (++i < len) {
            currentQueue[i]();
        }
        len = queue.length;
    }
    draining = false;
}
process.nextTick = function (fun) {
    queue.push(fun);
    if (!draining) {
        setTimeout(drainQueue, 0);
    }
};

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],3:[function(require,module,exports){
window.UserboundInterface = (function() {
  var $ = {
    z: require('./libs/zepto.js'),
    grapnel: require('grapnel'),
    simpleStorage: require('./libs/simpleStorage.js'),
    WaveSurfer: require('./libs/wavesurfer.min.js'),
    highlighter: require('./libs/highlight.js')
  };

  $.highlighter.registerLanguage('clojure', require('./libs/lang/clojure.js'));
  $.highlighter.registerLanguage('scss', require('./libs/lang/scss.js'));
  $.highlighter.registerLanguage('c++', require('./libs/lang/cpp.js'));
  $.highlighter.registerLanguage('ruby', require('./libs/lang/ruby.js'));
  $.highlighter.registerLanguage('openscad', require('./libs/lang/openscad.js'));
  $.highlighter.registerLanguage('js', require('./libs/lang/javascript.js'));
  $.highlighter.registerLanguage('smalltalk', require('./libs/lang/smalltalk.js'));
  $.highlighter.registerLanguage('go', require('./libs/lang/go.js'));


  var globals = require('./modules/globals.js');
  var util = require('./modules/util.js')($, globals);
  var router = new $.grapnel({ pushState: true });
  var event_handlers = require('./modules/event_handlers.js')($, globals, util, router);
  var setup_asciiw_demo = require('./modules/asciiw_demo.js')($, globals, util, router);
  var consulting_toggle = require('./modules/consulting_toggle.js')($, globals, util, router);

  return {
    init: function() {
      if (util.redirect_homepage_to('/blog')) { return; }
      if (consulting_toggle.install_consulting_toggle() === 'toggling consulting') { return; }

      // Seting up routes
      require('./modules/setup_routes.js')($, globals, util, router);

      // Syntax highlighting asciiw demo, audo player, event handlers 
      $.z("[data-language]").each(function(i, el) {
        $.highlighter.highlightBlock(el);
      });

      setup_asciiw_demo();
      event_handlers.install_dom_event_bindings();

      $.z("nav").addClass("fade-in");
      $.z("main").addClass("fade-down");
    }
  };

})();

window.onload = UserboundInterface.init;

},{"./libs/highlight.js":4,"./libs/lang/clojure.js":5,"./libs/lang/cpp.js":6,"./libs/lang/go.js":7,"./libs/lang/javascript.js":8,"./libs/lang/openscad.js":9,"./libs/lang/ruby.js":10,"./libs/lang/scss.js":11,"./libs/lang/smalltalk.js":12,"./libs/simpleStorage.js":13,"./libs/wavesurfer.min.js":14,"./libs/zepto.js":15,"./modules/asciiw_demo.js":16,"./modules/consulting_toggle.js":17,"./modules/event_handlers.js":18,"./modules/globals.js":19,"./modules/setup_routes.js":20,"./modules/util.js":21,"grapnel":1}],4:[function(require,module,exports){
/*
Syntax highlighting with language autodetection.
https://highlightjs.org/
*/

(function(factory) {

  window.hljs = factory({});

}(function(hljs) {

  /* Utility functions */

  function escape(value) {
    return value.replace(/&/gm, '&amp;').replace(/</gm, '&lt;').replace(/>/gm, '&gt;');
  }

  function tag(node) {
    return node.nodeName.toLowerCase();
  }

  function testRe(re, lexeme) {
    var match = re && re.exec(lexeme);
    return match && match.index == 0;
  }

  function isNotHighlighted(language) {
    return /no-?highlight|plain|text/.test(language);
  }

  function blockLanguage(block) {
    var i, match, length,
        classes = block.className + ' ';

    classes += block.parentNode ? block.parentNode.className : '';

    // language-* takes precedence over non-prefixed class names and
    match = /\blang(?:uage)?-([\w-]+)\b/.exec(classes);
    if (match) {
      return getLanguage(match[1]) ? match[1] : 'no-highlight';
    }

    classes = classes.split(/\s+/);
    for(i = 0, length = classes.length; i < length; i++) {
      if(getLanguage(classes[i]) || isNotHighlighted(classes[i])) {
        return classes[i];
      }
    }

  }

  function inherit(parent, obj) {
    var result = {}, key;
    for (key in parent)
      result[key] = parent[key];
    if (obj)
      for (key in obj)
        result[key] = obj[key];
    return result;
  }

  /* Stream merging */

  function nodeStream(node) {
    var result = [];
    (function _nodeStream(node, offset) {
      for (var child = node.firstChild; child; child = child.nextSibling) {
        if (child.nodeType == 3)
          offset += child.nodeValue.length;
        else if (child.nodeType == 1) {
          result.push({
            event: 'start',
            offset: offset,
            node: child
          });
          offset = _nodeStream(child, offset);
          // Prevent void elements from having an end tag that would actually
          // double them in the output. There are more void elements in HTML
          // but we list only those realistically expected in code display.
          if (!tag(child).match(/br|hr|img|input/)) {
            result.push({
              event: 'stop',
              offset: offset,
              node: child
            });
          }
        }
      }
      return offset;
    })(node, 0);
    return result;
  }

  function mergeStreams(original, highlighted, value) {
    var processed = 0;
    var result = '';
    var nodeStack = [];

    function selectStream() {
      if (!original.length || !highlighted.length) {
        return original.length ? original : highlighted;
      }
      if (original[0].offset != highlighted[0].offset) {
        return (original[0].offset < highlighted[0].offset) ? original : highlighted;
      }

      /*
      To avoid starting the stream just before it should stop the order is
      ensured that original always starts first and closes last:

      if (event1 == 'start' && event2 == 'start')
        return original;
      if (event1 == 'start' && event2 == 'stop')
        return highlighted;
      if (event1 == 'stop' && event2 == 'start')
        return original;
      if (event1 == 'stop' && event2 == 'stop')
        return highlighted;

      ... which is collapsed to:
      */
      return highlighted[0].event == 'start' ? original : highlighted;
    }

    function open(node) {
      function attr_str(a) {return ' ' + a.nodeName + '="' + escape(a.value) + '"';}
      result += '<' + tag(node) + Array.prototype.map.call(node.attributes, attr_str).join('') + '>';
    }

    function close(node) {
      result += '</' + tag(node) + '>';
    }

    function render(event) {
      (event.event == 'start' ? open : close)(event.node);
    }

    while (original.length || highlighted.length) {
      var stream = selectStream();
      result += escape(value.substr(processed, stream[0].offset - processed));
      processed = stream[0].offset;
      if (stream == original) {
        /*
        On any opening or closing tag of the original markup we first close
        the entire highlighted node stack, then render the original tag along
        with all the following original tags at the same offset and then
        reopen all the tags on the highlighted stack.
        */
        nodeStack.reverse().forEach(close);
        do {
          render(stream.splice(0, 1)[0]);
          stream = selectStream();
        } while (stream == original && stream.length && stream[0].offset == processed);
        nodeStack.reverse().forEach(open);
      } else {
        if (stream[0].event == 'start') {
          nodeStack.push(stream[0].node);
        } else {
          nodeStack.pop();
        }
        render(stream.splice(0, 1)[0]);
      }
    }
    return result + escape(value.substr(processed));
  }

  /* Initialization */

  function compileLanguage(language) {

    function reStr(re) {
        return (re && re.source) || re;
    }

    function langRe(value, global) {
      return new RegExp(
        reStr(value),
        'm' + (language.case_insensitive ? 'i' : '') + (global ? 'g' : '')
      );
    }

    function compileMode(mode, parent) {
      if (mode.compiled)
        return;
      mode.compiled = true;

      mode.keywords = mode.keywords || mode.beginKeywords;
      if (mode.keywords) {
        var compiled_keywords = {};

        var flatten = function(className, str) {
          if (language.case_insensitive) {
            str = str.toLowerCase();
          }
          str.split(' ').forEach(function(kw) {
            var pair = kw.split('|');
            compiled_keywords[pair[0]] = [className, pair[1] ? Number(pair[1]) : 1];
          });
        };

        if (typeof mode.keywords == 'string') { // string
          flatten('keyword', mode.keywords);
        } else {
          Object.keys(mode.keywords).forEach(function (className) {
            flatten(className, mode.keywords[className]);
          });
        }
        mode.keywords = compiled_keywords;
      }
      mode.lexemesRe = langRe(mode.lexemes || /\b\w+\b/, true);

      if (parent) {
        if (mode.beginKeywords) {
          mode.begin = '\\b(' + mode.beginKeywords.split(' ').join('|') + ')\\b';
        }
        if (!mode.begin)
          mode.begin = /\B|\b/;
        mode.beginRe = langRe(mode.begin);
        if (!mode.end && !mode.endsWithParent)
          mode.end = /\B|\b/;
        if (mode.end)
          mode.endRe = langRe(mode.end);
        mode.terminator_end = reStr(mode.end) || '';
        if (mode.endsWithParent && parent.terminator_end)
          mode.terminator_end += (mode.end ? '|' : '') + parent.terminator_end;
      }
      if (mode.illegal)
        mode.illegalRe = langRe(mode.illegal);
      if (mode.relevance === undefined)
        mode.relevance = 1;
      if (!mode.contains) {
        mode.contains = [];
      }
      var expanded_contains = [];
      mode.contains.forEach(function(c) {
        if (c.variants) {
          c.variants.forEach(function(v) {expanded_contains.push(inherit(c, v));});
        } else {
          expanded_contains.push(c == 'self' ? mode : c);
        }
      });
      mode.contains = expanded_contains;
      mode.contains.forEach(function(c) {compileMode(c, mode);});

      if (mode.starts) {
        compileMode(mode.starts, parent);
      }

      var terminators =
        mode.contains.map(function(c) {
          return c.beginKeywords ? '\\.?(' + c.begin + ')\\.?' : c.begin;
        })
        .concat([mode.terminator_end, mode.illegal])
        .map(reStr)
        .filter(Boolean);
      mode.terminators = terminators.length ? langRe(terminators.join('|'), true) : {exec: function(/*s*/) {return null;}};
    }

    compileMode(language);
  }

  /*
  Core highlighting function. Accepts a language name, or an alias, and a
  string with the code to highlight. Returns an object with the following
  properties:

  - relevance (int)
  - value (an HTML string with highlighting markup)

  */
  function highlight(name, value, ignore_illegals, continuation) {

    function subMode(lexeme, mode) {
      for (var i = 0; i < mode.contains.length; i++) {
        if (testRe(mode.contains[i].beginRe, lexeme)) {
          return mode.contains[i];
        }
      }
    }

    function endOfMode(mode, lexeme) {
      if (testRe(mode.endRe, lexeme)) {
        while (mode.endsParent && mode.parent) {
          mode = mode.parent;
        }
        return mode;
      }
      if (mode.endsWithParent) {
        return endOfMode(mode.parent, lexeme);
      }
    }

    function isIllegal(lexeme, mode) {
      return !ignore_illegals && testRe(mode.illegalRe, lexeme);
    }

    function keywordMatch(mode, match) {
      var match_str = language.case_insensitive ? match[0].toLowerCase() : match[0];
      return mode.keywords.hasOwnProperty(match_str) && mode.keywords[match_str];
    }

    function buildSpan(classname, insideSpan, leaveOpen, noPrefix) {
      var classPrefix = noPrefix ? '' : options.classPrefix,
          openSpan    = '<span class="' + classPrefix,
          closeSpan   = leaveOpen ? '' : '</span>';

      openSpan += classname + '">';

      return openSpan + insideSpan + closeSpan;
    }

    function processKeywords() {
      if (!top.keywords)
        return escape(mode_buffer);
      var result = '';
      var last_index = 0;
      top.lexemesRe.lastIndex = 0;
      var match = top.lexemesRe.exec(mode_buffer);
      while (match) {
        result += escape(mode_buffer.substr(last_index, match.index - last_index));
        var keyword_match = keywordMatch(top, match);
        if (keyword_match) {
          relevance += keyword_match[1];
          result += buildSpan(keyword_match[0], escape(match[0]));
        } else {
          result += escape(match[0]);
        }
        last_index = top.lexemesRe.lastIndex;
        match = top.lexemesRe.exec(mode_buffer);
      }
      return result + escape(mode_buffer.substr(last_index));
    }

    function processSubLanguage() {
      var explicit = typeof top.subLanguage == 'string';
      if (explicit && !languages[top.subLanguage]) {
        return escape(mode_buffer);
      }

      var result = explicit ?
                   highlight(top.subLanguage, mode_buffer, true, continuations[top.subLanguage]) :
                   highlightAuto(mode_buffer, top.subLanguage.length ? top.subLanguage : undefined);

      // Counting embedded language score towards the host language may be disabled
      // with zeroing the containing mode relevance. Usecase in point is Markdown that
      // allows XML everywhere and makes every XML snippet to have a much larger Markdown
      // score.
      if (top.relevance > 0) {
        relevance += result.relevance;
      }
      if (explicit) {
        continuations[top.subLanguage] = result.top;
      }
      return buildSpan(result.language, result.value, false, true);
    }

    function processBuffer() {
      return top.subLanguage !== undefined ? processSubLanguage() : processKeywords();
    }

    function startNewMode(mode, lexeme) {
      var markup = mode.className? buildSpan(mode.className, '', true): '';
      if (mode.returnBegin) {
        result += markup;
        mode_buffer = '';
      } else if (mode.excludeBegin) {
        result += escape(lexeme) + markup;
        mode_buffer = '';
      } else {
        result += markup;
        mode_buffer = lexeme;
      }
      top = Object.create(mode, {parent: {value: top}});
    }

    function processLexeme(buffer, lexeme) {

      mode_buffer += buffer;
      if (lexeme === undefined) {
        result += processBuffer();
        return 0;
      }

      var new_mode = subMode(lexeme, top);
      if (new_mode) {
        result += processBuffer();
        startNewMode(new_mode, lexeme);
        return new_mode.returnBegin ? 0 : lexeme.length;
      }

      var end_mode = endOfMode(top, lexeme);
      if (end_mode) {
        var origin = top;
        if (!(origin.returnEnd || origin.excludeEnd)) {
          mode_buffer += lexeme;
        }
        result += processBuffer();
        do {
          if (top.className) {
            result += '</span>';
          }
          relevance += top.relevance;
          top = top.parent;
        } while (top != end_mode.parent);
        if (origin.excludeEnd) {
          result += escape(lexeme);
        }
        mode_buffer = '';
        if (end_mode.starts) {
          startNewMode(end_mode.starts, '');
        }
        return origin.returnEnd ? 0 : lexeme.length;
      }

      if (isIllegal(lexeme, top))
        throw new Error('Illegal lexeme "' + lexeme + '" for mode "' + (top.className || '<unnamed>') + '"');

      /*
      Parser should not reach this point as all types of lexemes should be caught
      earlier, but if it does due to some bug make sure it advances at least one
      character forward to prevent infinite looping.
      */
      mode_buffer += lexeme;
      return lexeme.length || 1;
    }

    var language = getLanguage(name);
    if (!language) {
      throw new Error('Unknown language: "' + name + '"');
    }

    compileLanguage(language);
    var top = continuation || language;
    var continuations = {}; // keep continuations for sub-languages
    var result = '', current;
    for(current = top; current != language; current = current.parent) {
      if (current.className) {
        result = buildSpan(current.className, '', true) + result;
      }
    }
    var mode_buffer = '';
    var relevance = 0;
    try {
      var match, count, index = 0;
      while (true) {
        top.terminators.lastIndex = index;
        match = top.terminators.exec(value);
        if (!match)
          break;
        count = processLexeme(value.substr(index, match.index - index), match[0]);
        index = match.index + count;
      }
      processLexeme(value.substr(index));
      for(current = top; current.parent; current = current.parent) { // close dangling modes
        if (current.className) {
          result += '</span>';
        }
      }
      return {
        relevance: relevance,
        value: result,
        language: name,
        top: top
      };
    } catch (e) {
      if (e.message.indexOf('Illegal') != -1) {
        return {
          relevance: 0,
          value: escape(value)
        };
      } else {
        throw e;
      }
    }
  }

  /*
  Highlighting with language detection. Accepts a string with the code to
  highlight. Returns an object with the following properties:

  - language (detected language)
  - relevance (int)
  - value (an HTML string with highlighting markup)
  - second_best (object with the same structure for second-best heuristically
    detected language, may be absent)

  */
  function highlightAuto(text, languageSubset) {
    languageSubset = languageSubset || options.languages || Object.keys(languages);
    var result = {
      relevance: 0,
      value: escape(text)
    };
    var second_best = result;
    languageSubset.forEach(function(name) {
      if (!getLanguage(name)) {
        return;
      }
      var current = highlight(name, text, false);
      current.language = name;
      if (current.relevance > second_best.relevance) {
        second_best = current;
      }
      if (current.relevance > result.relevance) {
        second_best = result;
        result = current;
      }
    });
    if (second_best.language) {
      result.second_best = second_best;
    }
    return result;
  }

  /*
  Post-processing of the highlighted markup:

  - replace TABs with something more useful
  - replace real line-breaks with '<br>' for non-pre containers

  */
  function fixMarkup(value) {
    if (options.tabReplace) {
      value = value.replace(/^((<[^>]+>|\t)+)/gm, function(match, p1 /*..., offset, s*/) {
        return p1.replace(/\t/g, options.tabReplace);
      });
    }
    if (options.useBR) {
      value = value.replace(/\n/g, '<br>');
    }
    return value;
  }

  function buildClassName(prevClassName, currentLang, resultLang) {
    var language = currentLang ? aliases[currentLang] : resultLang,
        result   = [prevClassName.trim()];

    if (!prevClassName.match(/\bhljs\b/)) {
      result.push('hljs');
    }

    if (prevClassName.indexOf(language) === -1) {
      result.push(language);
    }

    return result.join(' ').trim();
  }

  /*
  Applies highlighting to a DOM node containing code. Accepts a DOM node and
  two optional parameters for fixMarkup.
  */
  function highlightBlock(block) {
    var language = blockLanguage(block);
    if (isNotHighlighted(language))
        return;

    var node;
    if (options.useBR) {
      node = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
      node.innerHTML = block.innerHTML.replace(/\n/g, '').replace(/<br[ \/]*>/g, '\n');
    } else {
      node = block;
    }
    var text = node.textContent;
    var result = language ? highlight(language, text, true) : highlightAuto(text);

    var originalStream = nodeStream(node);
    if (originalStream.length) {
      var resultNode = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
      resultNode.innerHTML = result.value;
      result.value = mergeStreams(originalStream, nodeStream(resultNode), text);
    }
    result.value = fixMarkup(result.value);

    block.innerHTML = result.value;
    block.className = buildClassName(block.className, language, result.language);
    block.result = {
      language: result.language,
      re: result.relevance
    };
    if (result.second_best) {
      block.second_best = {
        language: result.second_best.language,
        re: result.second_best.relevance
      };
    }
  }

  var options = {
    classPrefix: 'hljs-',
    tabReplace: null,
    useBR: false,
    languages: undefined
  };

  /*
  Updates highlight.js global options with values passed in the form of an object
  */
  function configure(user_options) {
    options = inherit(options, user_options);
  }

  /*
  Applies highlighting to all <pre><code>..</code></pre> blocks on a page.
  */
  function initHighlighting() {
    if (initHighlighting.called)
      return;
    initHighlighting.called = true;

    var blocks = document.querySelectorAll('pre code');
    Array.prototype.forEach.call(blocks, highlightBlock);
  }

  /*
  Attaches highlighting to the page load event.
  */
  function initHighlightingOnLoad() {
    addEventListener('DOMContentLoaded', initHighlighting, false);
    addEventListener('load', initHighlighting, false);
  }

  var languages = {};
  var aliases = {};

  function registerLanguage(name, language) {
    var lang = languages[name] = language(hljs);
    if (lang.aliases) {
      lang.aliases.forEach(function(alias) {aliases[alias] = name;});
    }
  }

  function listLanguages() {
    return Object.keys(languages);
  }

  function getLanguage(name) {
    return languages[name] || languages[aliases[name]];
  }

  /* Interface definition */

  hljs.highlight = highlight;
  hljs.highlightAuto = highlightAuto;
  hljs.fixMarkup = fixMarkup;
  hljs.highlightBlock = highlightBlock;
  hljs.configure = configure;
  hljs.initHighlighting = initHighlighting;
  hljs.initHighlightingOnLoad = initHighlightingOnLoad;
  hljs.registerLanguage = registerLanguage;
  hljs.listLanguages = listLanguages;
  hljs.getLanguage = getLanguage;
  hljs.inherit = inherit;

  // Common regexps
  hljs.IDENT_RE = '[a-zA-Z]\\w*';
  hljs.UNDERSCORE_IDENT_RE = '[a-zA-Z_]\\w*';
  hljs.NUMBER_RE = '\\b\\d+(\\.\\d+)?';
  hljs.C_NUMBER_RE = '(\\b0[xX][a-fA-F0-9]+|(\\b\\d+(\\.\\d*)?|\\.\\d+)([eE][-+]?\\d+)?)'; // 0x..., 0..., decimal, float
  hljs.BINARY_NUMBER_RE = '\\b(0b[01]+)'; // 0b...
  hljs.RE_STARTERS_RE = '!|!=|!==|%|%=|&|&&|&=|\\*|\\*=|\\+|\\+=|,|-|-=|/=|/|:|;|<<|<<=|<=|<|===|==|=|>>>=|>>=|>=|>>>|>>|>|\\?|\\[|\\{|\\(|\\^|\\^=|\\||\\|=|\\|\\||~';

  // Common modes
  hljs.BACKSLASH_ESCAPE = {
    begin: '\\\\[\\s\\S]', relevance: 0
  };
  hljs.APOS_STRING_MODE = {
    className: 'string',
    begin: '\'', end: '\'',
    illegal: '\\n',
    contains: [hljs.BACKSLASH_ESCAPE]
  };
  hljs.QUOTE_STRING_MODE = {
    className: 'string',
    begin: '"', end: '"',
    illegal: '\\n',
    contains: [hljs.BACKSLASH_ESCAPE]
  };
  hljs.PHRASAL_WORDS_MODE = {
    begin: /\b(a|an|the|are|I|I'm|isn't|don't|doesn't|won't|but|just|should|pretty|simply|enough|gonna|going|wtf|so|such)\b/
  };
  hljs.COMMENT = function (begin, end, inherits) {
    var mode = hljs.inherit(
      {
        className: 'comment',
        begin: begin, end: end,
        contains: []
      },
      inherits || {}
    );
    mode.contains.push(hljs.PHRASAL_WORDS_MODE);
    mode.contains.push({
      className: 'doctag',
      begin: "(?:TODO|FIXME|NOTE|BUG|XXX):",
      relevance: 0
    });
    return mode;
  };
  hljs.C_LINE_COMMENT_MODE = hljs.COMMENT('//', '$');
  hljs.C_BLOCK_COMMENT_MODE = hljs.COMMENT('/\\*', '\\*/');
  hljs.HASH_COMMENT_MODE = hljs.COMMENT('#', '$');
  hljs.NUMBER_MODE = {
    className: 'number',
    begin: hljs.NUMBER_RE,
    relevance: 0
  };
  hljs.C_NUMBER_MODE = {
    className: 'number',
    begin: hljs.C_NUMBER_RE,
    relevance: 0
  };
  hljs.BINARY_NUMBER_MODE = {
    className: 'number',
    begin: hljs.BINARY_NUMBER_RE,
    relevance: 0
  };
  hljs.CSS_NUMBER_MODE = {
    className: 'number',
    begin: hljs.NUMBER_RE + '(' +
      '%|em|ex|ch|rem'  +
      '|vw|vh|vmin|vmax' +
      '|cm|mm|in|pt|pc|px' +
      '|deg|grad|rad|turn' +
      '|s|ms' +
      '|Hz|kHz' +
      '|dpi|dpcm|dppx' +
      ')?',
    relevance: 0
  };
  hljs.REGEXP_MODE = {
    className: 'regexp',
    begin: /\//, end: /\/[gimuy]*/,
    illegal: /\n/,
    contains: [
      hljs.BACKSLASH_ESCAPE,
      {
        begin: /\[/, end: /\]/,
        relevance: 0,
        contains: [hljs.BACKSLASH_ESCAPE]
      }
    ]
  };
  hljs.TITLE_MODE = {
    className: 'title',
    begin: hljs.IDENT_RE,
    relevance: 0
  };
  hljs.UNDERSCORE_TITLE_MODE = {
    className: 'title',
    begin: hljs.UNDERSCORE_IDENT_RE,
    relevance: 0
  };

  return hljs;
}));


module.exports = window.hljs;

},{}],5:[function(require,module,exports){
/*
Language: Clojure
Description: Clojure syntax (based on lisp.js)
Author: mfornos
Category: lisp
*/
module.exports = function(hljs) {
	return (function(hljs) {
		var keywords = {
			'builtin-name':
				// Clojure keywords
				'def defonce cond apply if-not if-let if not not= = < > <= >= == + / * - rem '+
				'quot neg? pos? delay? symbol? keyword? true? false? integer? empty? coll? list? '+
				'set? ifn? fn? associative? sequential? sorted? counted? reversible? number? decimal? '+
				'class? distinct? isa? float? rational? reduced? ratio? odd? even? char? seq? vector? '+
				'string? map? nil? contains? zero? instance? not-every? not-any? libspec? -> ->> .. . '+
				'inc compare do dotimes mapcat take remove take-while drop letfn drop-last take-last '+
				'drop-while while intern condp case reduced cycle split-at split-with repeat replicate '+
				'iterate range merge zipmap declare line-seq sort comparator sort-by dorun doall nthnext '+
				'nthrest partition eval doseq await await-for let agent atom send send-off release-pending-sends '+
				'add-watch mapv filterv remove-watch agent-error restart-agent set-error-handler error-handler '+
				'set-error-mode! error-mode shutdown-agents quote var fn loop recur throw try monitor-enter '+
				'monitor-exit defmacro defn defn- macroexpand macroexpand-1 for dosync and or '+
				'when when-not when-let comp juxt partial sequence memoize constantly complement identity assert '+
				'peek pop doto proxy defstruct first rest cons defprotocol cast coll deftype defrecord last butlast '+
				'sigs reify second ffirst fnext nfirst nnext defmulti defmethod meta with-meta ns in-ns create-ns import '+
				'refer keys select-keys vals key val rseq name namespace promise into transient persistent! conj! '+
				'assoc! dissoc! pop! disj! use class type num float double short byte boolean bigint biginteger '+
				'bigdec print-method print-dup throw-if printf format load compile get-in update-in pr pr-on newline '+
				'flush read slurp read-line subvec with-open memfn time re-find re-groups rand-int rand mod locking '+
				'assert-valid-fdecl alias resolve ref deref refset swap! reset! set-validator! compare-and-set! alter-meta! '+
				'reset-meta! commute get-validator alter ref-set ref-history-count ref-min-history ref-max-history ensure sync io! '+
				'new next conj set! to-array future future-call into-array aset gen-class reduce map filter find empty '+
				'hash-map hash-set sorted-map sorted-map-by sorted-set sorted-set-by vec vector seq flatten reverse assoc dissoc list '+
				'disj get union difference intersection extend extend-type extend-protocol int nth delay count concat chunk chunk-buffer '+
				'chunk-append chunk-first chunk-rest max min dec unchecked-inc-int unchecked-inc unchecked-dec-inc unchecked-dec unchecked-negate '+
				'unchecked-add-int unchecked-add unchecked-subtract-int unchecked-subtract chunk-next chunk-cons chunked-seq? prn vary-meta '+
				'lazy-seq spread list* str find-keyword keyword symbol gensym force rationalize'
		 };

		var SYMBOLSTART = 'a-zA-Z_\\-!.?+*=<>&#\'';
		var SYMBOL_RE = '[' + SYMBOLSTART + '][' + SYMBOLSTART + '0-9/;:]*';
		var SIMPLE_NUMBER_RE = '[-+]?\\d+(\\.\\d+)?';

		var SYMBOL = {
			begin: SYMBOL_RE,
			relevance: 0
		};
		var NUMBER = {
			className: 'number', begin: SIMPLE_NUMBER_RE,
			relevance: 0
		};
		var STRING = hljs.inherit(hljs.QUOTE_STRING_MODE, {illegal: null});
		var COMMENT = hljs.COMMENT(
			';',
			'$',
			{
				relevance: 0
			}
		);
		var LITERAL = {
			className: 'literal',
			begin: /\b(true|false|nil)\b/
		};
		var COLLECTION = {
			begin: '[\\[\\{]', end: '[\\]\\}]'
		};
		var HINT = {
			className: 'comment',
			begin: '\\^' + SYMBOL_RE
		};
		var HINT_COL = hljs.COMMENT('\\^\\{', '\\}');
		var KEY = {
			className: 'symbol',
			begin: '[:]' + SYMBOL_RE
		};
		var LIST = {
			begin: '\\(', end: '\\)'
		};
		var BODY = {
			endsWithParent: true,
			relevance: 0
		};
		var NAME = {
			keywords: keywords,
			lexemes: SYMBOL_RE,
			className: 'name', begin: SYMBOL_RE,
			starts: BODY
		};
		var DEFAULT_CONTAINS = [LIST, STRING, HINT, HINT_COL, COMMENT, KEY, COLLECTION, NUMBER, LITERAL, SYMBOL];

		LIST.contains = [hljs.COMMENT('comment', ''), NAME, BODY];
		BODY.contains = DEFAULT_CONTAINS;
		COLLECTION.contains = DEFAULT_CONTAINS;

		return {
			aliases: ['clj'],
			illegal: /\S/,
			contains: [LIST, STRING, HINT, HINT_COL, COMMENT, KEY, COLLECTION, NUMBER, LITERAL]
		}

	})(hljs);
};

},{}],6:[function(require,module,exports){
/*
Language: C++
Author: Ivan Sagalaev <maniac@softwaremaniacs.org>
Contributors: Evgeny Stepanischev <imbolk@gmail.com>, Zaven Muradyan <megalivoithos@gmail.com>, Roel Deckers <admin@codingcat.nl>
Category: common, system
*/

module.exports = function(hljs) {
  var CPP_PRIMATIVE_TYPES = {
    className: 'keyword',
    begin: '\\b[a-z\\d_]*_t\\b'
  };

  var CPP_KEYWORDS = {
    keyword: 'false int float while private char catch export virtual operator sizeof ' +
      'dynamic_cast|10 typedef const_cast|10 const struct for static_cast|10 union namespace ' +
      'unsigned long volatile static protected bool template mutable if public friend ' +
      'do goto auto void enum else break extern using true class asm case typeid ' +
      'short reinterpret_cast|10 default double register explicit signed typename try this ' +
      'switch continue inline delete alignof constexpr decltype ' +
      'noexcept nullptr static_assert thread_local restrict _Bool complex _Complex _Imaginary ' +
      'atomic_bool atomic_char atomic_schar ' +
      'atomic_uchar atomic_short atomic_ushort atomic_int atomic_uint atomic_long atomic_ulong atomic_llong ' +
      'atomic_ullong',
    built_in: 'std string cin cout cerr clog stringstream istringstream ostringstream ' +
      'auto_ptr deque list queue stack vector map set bitset multiset multimap unordered_set ' +
      'unordered_map unordered_multiset unordered_multimap array shared_ptr abort abs acos ' +
      'asin atan2 atan calloc ceil cosh cos exit exp fabs floor fmod fprintf fputs free frexp ' +
      'fscanf isalnum isalpha iscntrl isdigit isgraph islower isprint ispunct isspace isupper ' +
      'isxdigit tolower toupper labs ldexp log10 log malloc memchr memcmp memcpy memset modf pow ' +
      'printf putchar puts scanf sinh sin snprintf sprintf sqrt sscanf strcat strchr strcmp ' +
      'strcpy strcspn strlen strncat strncmp strncpy strpbrk strrchr strspn strstr tanh tan ' +
      'vfprintf vprintf vsprintf'
  };
  return {
    aliases: ['c', 'cc', 'h', 'c++', 'h++', 'hpp'],
    keywords: CPP_KEYWORDS,
    illegal: '</',
    contains: [
      CPP_PRIMATIVE_TYPES,
      hljs.C_LINE_COMMENT_MODE,
      hljs.C_BLOCK_COMMENT_MODE,
      {
        className: 'string',
        variants: [
          hljs.inherit(hljs.QUOTE_STRING_MODE, { begin: '((u8?|U)|L)?"' }),
          {
            begin: '(u8?|U)?R"', end: '"',
            contains: [hljs.BACKSLASH_ESCAPE]
          },
          {
            begin: '\'\\\\?.', end: '\'',
            illegal: '.'
          }
        ]
      },
      {
        className: 'number',
        begin: '\\b(\\d+(\\.\\d*)?|\\.\\d+)(u|U|l|L|ul|UL|f|F)'
      },
      hljs.C_NUMBER_MODE,
      {
        className: 'preprocessor',
        begin: '#', end: '$',
        keywords: 'if else elif endif define undef warning error line pragma',
        contains: [
          {
            begin: /\\\n/, relevance: 0
          },
          {
            begin: 'include\\s*[<"]', end: '[>"]',
            keywords: 'include',
            illegal: '\\n'
          },
          hljs.C_LINE_COMMENT_MODE
        ]
      },
      {
        begin: '\\b(deque|list|queue|stack|vector|map|set|bitset|multiset|multimap|unordered_map|unordered_set|unordered_multiset|unordered_multimap|array)\\s*<', end: '>',
        keywords: CPP_KEYWORDS,
        contains: ['self', CPP_PRIMATIVE_TYPES]
      },
      {
        begin: hljs.IDENT_RE + '::',
        keywords: CPP_KEYWORDS
      },
      {
        // Expression keywords prevent 'keyword Name(...) or else if(...)' from
        // being recognized as a function definition
        beginKeywords: 'new throw return else',
        relevance: 0
      },
      {
        className: 'function',
        begin: '(' + hljs.IDENT_RE + '\\s+)+' + hljs.IDENT_RE + '\\s*\\(', returnBegin: true, end: /[{;=]/,
        excludeEnd: true,
        keywords: CPP_KEYWORDS,
        contains: [
          {
            begin: hljs.IDENT_RE + '\\s*\\(', returnBegin: true,
            contains: [hljs.TITLE_MODE],
            relevance: 0
          },
          {
            className: 'params',
            begin: /\(/, end: /\)/,
            keywords: CPP_KEYWORDS,
            relevance: 0,
            contains: [
              hljs.C_BLOCK_COMMENT_MODE
            ]
          },
          hljs.C_LINE_COMMENT_MODE,
          hljs.C_BLOCK_COMMENT_MODE
        ]
      }
    ]
  };
}

},{}],7:[function(require,module,exports){
/*
Language: Go
Author: Stephan Kountso aka StepLg <steplg@gmail.com>
Contributors: Evgeny Stepanischev <imbolk@gmail.com>
Description: Google go language (golang). For info about language see http://golang.org/
Category: system
*/

module.exports = function(hljs) {
  var GO_KEYWORDS = {
    keyword:
      'break default func interface select case map struct chan else goto package switch ' +
      'const fallthrough if range type continue for import return var go defer ' +
      'bool byte complex64 complex128 float32 float64 int8 int16 int32 int64 string uint8 ' +
      'uint16 uint32 uint64 int uint uintptr rune',
    literal:
       'true false iota nil',
    built_in:
      'append cap close complex copy imag len make new panic print println real recover delete'
  };
  return {
    aliases: ['golang'],
    keywords: GO_KEYWORDS,
    illegal: '</',
    contains: [
      hljs.C_LINE_COMMENT_MODE,
      hljs.C_BLOCK_COMMENT_MODE,
      {
        className: 'string',
        variants: [
          hljs.QUOTE_STRING_MODE,
          {begin: '\'', end: '[^\\\\]\''},
          {begin: '`', end: '`'},
        ]
      },
      {
        className: 'number',
        variants: [
          {begin: hljs.C_NUMBER_RE + '[dflsi]', relevance: 1},
          hljs.C_NUMBER_MODE
        ]
      },
      {
        begin: /:=/ // relevance booster
      },
      {
        className: 'function',
        beginKeywords: 'func', end: /\s*\{/, excludeEnd: true,
        contains: [
          hljs.TITLE_MODE,
          {
            className: 'params',
            begin: /\(/, end: /\)/,
            keywords: GO_KEYWORDS,
            illegal: /["']/
          }
        ]
      }
    ]
  };
}

},{}],8:[function(require,module,exports){
/*
Language: JavaScript
Category: common, scripting
*/

module.exports = function(hljs) {
  return {
    aliases: ['js'],
    keywords: {
      keyword:
        'in of if for while finally var new function do return void else break catch ' +
        'instanceof with throw case default try this switch continue typeof delete ' +
        'let yield const export super debugger as async await',
      literal:
        'true false null undefined NaN Infinity',
      built_in:
        'eval isFinite isNaN parseFloat parseInt decodeURI decodeURIComponent ' +
        'encodeURI encodeURIComponent escape unescape Object Function Boolean Error ' +
        'EvalError InternalError RangeError ReferenceError StopIteration SyntaxError ' +
        'TypeError URIError Number Math Date String RegExp Array Float32Array ' +
        'Float64Array Int16Array Int32Array Int8Array Uint16Array Uint32Array ' +
        'Uint8Array Uint8ClampedArray ArrayBuffer DataView JSON Intl arguments require ' +
        'module console window document Symbol Set Map WeakSet WeakMap Proxy Reflect ' +
        'Promise'
    },
    contains: [
      {
        className: 'pi',
        relevance: 10,
        begin: /^\s*['"]use (strict|asm)['"]/
      },
      hljs.APOS_STRING_MODE,
      hljs.QUOTE_STRING_MODE,
      { // template string
        className: 'string',
        begin: '`', end: '`',
        contains: [
          hljs.BACKSLASH_ESCAPE,
          {
            className: 'subst',
            begin: '\\$\\{', end: '\\}'
          }
        ]
      },
      hljs.C_LINE_COMMENT_MODE,
      hljs.C_BLOCK_COMMENT_MODE,
      {
        className: 'number',
        variants: [
          { begin: '\\b(0[bB][01]+)' },
          { begin: '\\b(0[oO][0-7]+)' },
          { begin: hljs.C_NUMBER_RE }
        ],
        relevance: 0
      },
      { // "value" container
        begin: '(' + hljs.RE_STARTERS_RE + '|\\b(case|return|throw)\\b)\\s*',
        keywords: 'return throw case',
        contains: [
          hljs.C_LINE_COMMENT_MODE,
          hljs.C_BLOCK_COMMENT_MODE,
          hljs.REGEXP_MODE,
          { // E4X / JSX
            begin: /</, end: />\s*[);\]]/,
            relevance: 0,
            subLanguage: 'xml'
          }
        ],
        relevance: 0
      },
      {
        className: 'function',
        beginKeywords: 'function', end: /\{/, excludeEnd: true,
        contains: [
          hljs.inherit(hljs.TITLE_MODE, {begin: /[A-Za-z$_][0-9A-Za-z$_]*/}),
          {
            className: 'params',
            begin: /\(/, end: /\)/,
            excludeBegin: true,
            excludeEnd: true,
            contains: [
              hljs.C_LINE_COMMENT_MODE,
              hljs.C_BLOCK_COMMENT_MODE
            ],
            illegal: /["'\(]/
          }
        ],
        illegal: /\[|%/
      },
      {
        begin: /\$[(.]/ // relevance booster for a pattern common to JS libs: `$(something)` and `$.something`
      },
      {
        begin: '\\.' + hljs.IDENT_RE, relevance: 0 // hack: prevents detection of keywords after dots
      },
      // ECMAScript 6 modules import
      {
        beginKeywords: 'import', end: '[;$]',
        keywords: 'import from as',
        contains: [
          hljs.APOS_STRING_MODE,
          hljs.QUOTE_STRING_MODE
        ]
      },
      { // ES6 class
        className: 'class',
        beginKeywords: 'class', end: /[{;=]/, excludeEnd: true,
        illegal: /[:"\[\]]/,
        contains: [
          {beginKeywords: 'extends'},
          hljs.UNDERSCORE_TITLE_MODE
        ]
      }
    ]
  };
}

},{}],9:[function(require,module,exports){
/*
Language: OpenSCAD
Author: Dan Panzarella <alsoelp@gmail.com>
Description: OpenSCAD is a language for the 3D CAD modeling software of the same name.
Category: scientific
*/

module.exports = function(hljs) {
	var SPECIAL_VARS = {
		className: 'keyword',
		begin: '\\$(f[asn]|t|vp[rtd]|children)'
	},
	LITERALS = {
		className: 'literal',
		begin: 'false|true|PI|undef'
	},
	NUMBERS = {
		className: 'number',
		begin: '\\b\\d+(\\.\\d+)?(e-?\\d+)?', //adds 1e5, 1e-10
		relevance: 0
	},
	STRING = hljs.inherit(hljs.QUOTE_STRING_MODE,{illegal: null}),
	PREPRO = {
		className: 'preprocessor',
		keywords: 'include use',
		begin: 'include|use <',
		end: '>'
	},
	PARAMS = {
		className: 'params',
		begin: '\\(', end: '\\)',
		contains: ['self', NUMBERS, STRING, SPECIAL_VARS, LITERALS]
	},
	MODIFIERS = {
		className: 'built_in',
		begin: '[*!#%]',
		relevance: 0
	},
	FUNCTIONS = {
		className: 'function',
		beginKeywords: 'module function',
		end: '\\=|\\{',
		contains: [PARAMS, hljs.UNDERSCORE_TITLE_MODE]
	};

	return {
		aliases: ['scad'],
		keywords: {
			keyword: 'function module include use for intersection_for if else \\%',
			literal: 'false true PI undef',
			built_in: 'circle square polygon text sphere cube cylinder polyhedron translate rotate scale resize mirror multmatrix color offset hull minkowski union difference intersection abs sign sin cos tan acos asin atan atan2 floor round ceil ln log pow sqrt exp rands min max concat lookup str chr search version version_num norm cross parent_module echo import import_dxf dxf_linear_extrude linear_extrude rotate_extrude surface projection render children dxf_cross dxf_dim let assign'
		},
		contains: [
			hljs.C_LINE_COMMENT_MODE,
			hljs.C_BLOCK_COMMENT_MODE,
			NUMBERS,
			PREPRO,
			STRING,
			PARAMS,
			SPECIAL_VARS,
			MODIFIERS,
			FUNCTIONS
		]
	}
}

},{}],10:[function(require,module,exports){
/*
Language: Ruby
Author: Anton Kovalyov <anton@kovalyov.net>
Contributors: Peter Leonov <gojpeg@yandex.ru>, Vasily Polovnyov <vast@whiteants.net>, Loren Segal <lsegal@soen.ca>, Pascal Hurni <phi@ruby-reactive.org>, Cedric Sohrauer <sohrauer@googlemail.com>
Category: common
*/

module.exports = function(hljs) {
  var RUBY_METHOD_RE = '[a-zA-Z_]\\w*[!?=]?|[-+~]\\@|<<|>>|=~|===?|<=>|[<>]=?|\\*\\*|[-/+%^&*~`|]|\\[\\]=?';
  var RUBY_KEYWORDS =
    'and false then defined module in return redo if BEGIN retry end for true self when ' +
    'next until do begin unless END rescue nil else break undef not super class case ' +
    'require yield alias while ensure elsif or include attr_reader attr_writer attr_accessor';
  var YARDOCTAG = {
    className: 'doctag',
    begin: '@[A-Za-z]+'
  };
  var IRB_OBJECT = {
    className: 'value',
    begin: '#<', end: '>'
  };
  var COMMENT_MODES = [
    hljs.COMMENT(
      '#',
      '$',
      {
        contains: [YARDOCTAG]
      }
    ),
    hljs.COMMENT(
      '^\\=begin',
      '^\\=end',
      {
        contains: [YARDOCTAG],
        relevance: 10
      }
    ),
    hljs.COMMENT('^__END__', '\\n$')
  ];
  var SUBST = {
    className: 'subst',
    begin: '#\\{', end: '}',
    keywords: RUBY_KEYWORDS
  };
  var STRING = {
    className: 'string',
    contains: [hljs.BACKSLASH_ESCAPE, SUBST],
    variants: [
      {begin: /'/, end: /'/},
      {begin: /"/, end: /"/},
      {begin: /`/, end: /`/},
      {begin: '%[qQwWx]?\\(', end: '\\)'},
      {begin: '%[qQwWx]?\\[', end: '\\]'},
      {begin: '%[qQwWx]?{', end: '}'},
      {begin: '%[qQwWx]?<', end: '>'},
      {begin: '%[qQwWx]?/', end: '/'},
      {begin: '%[qQwWx]?%', end: '%'},
      {begin: '%[qQwWx]?-', end: '-'},
      {begin: '%[qQwWx]?\\|', end: '\\|'},
      {
        // \B in the beginning suppresses recognition of ?-sequences where ?
        // is the last character of a preceding identifier, as in: `func?4`
        begin: /\B\?(\\\d{1,3}|\\x[A-Fa-f0-9]{1,2}|\\u[A-Fa-f0-9]{4}|\\?\S)\b/
      }
    ]
  };
  var PARAMS = {
    className: 'params',
    begin: '\\(', end: '\\)',
    keywords: RUBY_KEYWORDS
  };

  var RUBY_DEFAULT_CONTAINS = [
    STRING,
    IRB_OBJECT,
    {
      className: 'class',
      beginKeywords: 'class module', end: '$|;',
      illegal: /=/,
      contains: [
        hljs.inherit(hljs.TITLE_MODE, {begin: '[A-Za-z_]\\w*(::\\w+)*(\\?|\\!)?'}),
        {
          className: 'inheritance',
          begin: '<\\s*',
          contains: [{
            className: 'parent',
            begin: '(' + hljs.IDENT_RE + '::)?' + hljs.IDENT_RE
          }]
        }
      ].concat(COMMENT_MODES)
    },
    {
      className: 'function',
      beginKeywords: 'def', end: '$|;',
      relevance: 0,
      contains: [
        hljs.inherit(hljs.TITLE_MODE, {begin: RUBY_METHOD_RE}),
        PARAMS
      ].concat(COMMENT_MODES)
    },
    {
      className: 'constant',
      begin: '(::)?(\\b[A-Z]\\w*(::)?)+',
      relevance: 0
    },
    {
      className: 'symbol',
      begin: hljs.UNDERSCORE_IDENT_RE + '(\\!|\\?)?:',
      relevance: 0
    },
    {
      className: 'symbol',
      begin: ':',
      contains: [STRING, {begin: RUBY_METHOD_RE}],
      relevance: 0
    },
    {
      className: 'number',
      begin: '(\\b0[0-7_]+)|(\\b0x[0-9a-fA-F_]+)|(\\b[1-9][0-9_]*(\\.[0-9_]+)?)|[0_]\\b',
      relevance: 0
    },
    {
      className: 'variable',
      begin: '(\\$\\W)|((\\$|\\@\\@?)(\\w+))'
    },
    { // regexp container
      begin: '(' + hljs.RE_STARTERS_RE + ')\\s*',
      contains: [
        IRB_OBJECT,
        {
          className: 'regexp',
          contains: [hljs.BACKSLASH_ESCAPE, SUBST],
          illegal: /\n/,
          variants: [
            {begin: '/', end: '/[a-z]*'},
            {begin: '%r{', end: '}[a-z]*'},
            {begin: '%r\\(', end: '\\)[a-z]*'},
            {begin: '%r!', end: '![a-z]*'},
            {begin: '%r\\[', end: '\\][a-z]*'}
          ]
        }
      ].concat(COMMENT_MODES),
      relevance: 0
    }
  ].concat(COMMENT_MODES);

  SUBST.contains = RUBY_DEFAULT_CONTAINS;
  PARAMS.contains = RUBY_DEFAULT_CONTAINS;

  var SIMPLE_PROMPT = "[>?]>";
  var DEFAULT_PROMPT = "[\\w#]+\\(\\w+\\):\\d+:\\d+>";
  var RVM_PROMPT = "(\\w+-)?\\d+\\.\\d+\\.\\d(p\\d+)?[^>]+>";

  var IRB_DEFAULT = [
    {
      begin: /^\s*=>/,
      className: 'status',
      starts: {
        end: '$', contains: RUBY_DEFAULT_CONTAINS
      }
    },
    {
      className: 'prompt',
      begin: '^('+SIMPLE_PROMPT+"|"+DEFAULT_PROMPT+'|'+RVM_PROMPT+')',
      starts: {
        end: '$', contains: RUBY_DEFAULT_CONTAINS
      }
    }
  ];

  return {
    aliases: ['rb', 'gemspec', 'podspec', 'thor', 'irb'],
    keywords: RUBY_KEYWORDS,
    contains: COMMENT_MODES.concat(IRB_DEFAULT).concat(RUBY_DEFAULT_CONTAINS)
  };
}

},{}],11:[function(require,module,exports){
/*
Language: SCSS
Author: Kurt Emch <kurt@kurtemch.com>
Category: css
*/
module.exports = function(hljs) {
  var IDENT_RE = '[a-zA-Z-][a-zA-Z0-9_-]*';
  var VARIABLE = {
    className: 'variable',
    begin: '(\\$' + IDENT_RE + ')\\b'
  };
  var FUNCTION = {
    className: 'function',
    begin: IDENT_RE + '\\(',
    returnBegin: true,
    excludeEnd: true,
    end: '\\('
  };
  var HEXCOLOR = {
    className: 'hexcolor', begin: '#[0-9A-Fa-f]+'
  };
  var DEF_INTERNALS = {
    className: 'attribute',
    begin: '[A-Z\\_\\.\\-]+', end: ':',
    excludeEnd: true,
    illegal: '[^\\s]',
    starts: {
      className: 'value',
      endsWithParent: true, excludeEnd: true,
      contains: [
        FUNCTION,
        HEXCOLOR,
        hljs.CSS_NUMBER_MODE,
        hljs.QUOTE_STRING_MODE,
        hljs.APOS_STRING_MODE,
        hljs.C_BLOCK_COMMENT_MODE,
        {
          className: 'important', begin: '!important'
        }
      ]
    }
  };
  return {
    case_insensitive: true,
    illegal: '[=/|\']',
    contains: [
      hljs.C_LINE_COMMENT_MODE,
      hljs.C_BLOCK_COMMENT_MODE,
      FUNCTION,
      {
        className: 'id', begin: '\\#[A-Za-z0-9_-]+',
        relevance: 0
      },
      {
        className: 'class', begin: '\\.[A-Za-z0-9_-]+',
        relevance: 0
      },
      {
        className: 'attr_selector',
        begin: '\\[', end: '\\]',
        illegal: '$'
      },
      {
        className: 'tag', // begin: IDENT_RE, end: '[,|\\s]'
        begin: '\\b(a|abbr|acronym|address|area|article|aside|audio|b|base|big|blockquote|body|br|button|canvas|caption|cite|code|col|colgroup|command|datalist|dd|del|details|dfn|div|dl|dt|em|embed|fieldset|figcaption|figure|footer|form|frame|frameset|(h[1-6])|head|header|hgroup|hr|html|i|iframe|img|input|ins|kbd|keygen|label|legend|li|link|map|mark|meta|meter|nav|noframes|noscript|object|ol|optgroup|option|output|p|param|pre|progress|q|rp|rt|ruby|samp|script|section|select|small|span|strike|strong|style|sub|sup|table|tbody|td|textarea|tfoot|th|thead|time|title|tr|tt|ul|var|video)\\b',
        relevance: 0
      },
      {
        className: 'pseudo',
        begin: ':(visited|valid|root|right|required|read-write|read-only|out-range|optional|only-of-type|only-child|nth-of-type|nth-last-of-type|nth-last-child|nth-child|not|link|left|last-of-type|last-child|lang|invalid|indeterminate|in-range|hover|focus|first-of-type|first-line|first-letter|first-child|first|enabled|empty|disabled|default|checked|before|after|active)'
      },
      {
        className: 'pseudo',
        begin: '::(after|before|choices|first-letter|first-line|repeat-index|repeat-item|selection|value)'
      },
      VARIABLE,
      {
        className: 'attribute',
        begin: '\\b(z-index|word-wrap|word-spacing|word-break|width|widows|white-space|visibility|vertical-align|unicode-bidi|transition-timing-function|transition-property|transition-duration|transition-delay|transition|transform-style|transform-origin|transform|top|text-underline-position|text-transform|text-shadow|text-rendering|text-overflow|text-indent|text-decoration-style|text-decoration-line|text-decoration-color|text-decoration|text-align-last|text-align|tab-size|table-layout|right|resize|quotes|position|pointer-events|perspective-origin|perspective|page-break-inside|page-break-before|page-break-after|padding-top|padding-right|padding-left|padding-bottom|padding|overflow-y|overflow-x|overflow-wrap|overflow|outline-width|outline-style|outline-offset|outline-color|outline|orphans|order|opacity|object-position|object-fit|normal|none|nav-up|nav-right|nav-left|nav-index|nav-down|min-width|min-height|max-width|max-height|mask|marks|margin-top|margin-right|margin-left|margin-bottom|margin|list-style-type|list-style-position|list-style-image|list-style|line-height|letter-spacing|left|justify-content|initial|inherit|ime-mode|image-orientation|image-resolution|image-rendering|icon|hyphens|height|font-weight|font-variant-ligatures|font-variant|font-style|font-stretch|font-size-adjust|font-size|font-language-override|font-kerning|font-feature-settings|font-family|font|float|flex-wrap|flex-shrink|flex-grow|flex-flow|flex-direction|flex-basis|flex|filter|empty-cells|display|direction|cursor|counter-reset|counter-increment|content|column-width|column-span|column-rule-width|column-rule-style|column-rule-color|column-rule|column-gap|column-fill|column-count|columns|color|clip-path|clip|clear|caption-side|break-inside|break-before|break-after|box-sizing|box-shadow|box-decoration-break|bottom|border-width|border-top-width|border-top-style|border-top-right-radius|border-top-left-radius|border-top-color|border-top|border-style|border-spacing|border-right-width|border-right-style|border-right-color|border-right|border-radius|border-left-width|border-left-style|border-left-color|border-left|border-image-width|border-image-source|border-image-slice|border-image-repeat|border-image-outset|border-image|border-color|border-collapse|border-bottom-width|border-bottom-style|border-bottom-right-radius|border-bottom-left-radius|border-bottom-color|border-bottom|border|background-size|background-repeat|background-position|background-origin|background-image|background-color|background-clip|background-attachment|background-blend-mode|background|backface-visibility|auto|animation-timing-function|animation-play-state|animation-name|animation-iteration-count|animation-fill-mode|animation-duration|animation-direction|animation-delay|animation|align-self|align-items|align-content)\\b',
        illegal: '[^\\s]'
      },
      {
        className: 'value',
        begin: '\\b(whitespace|wait|w-resize|visible|vertical-text|vertical-ideographic|uppercase|upper-roman|upper-alpha|underline|transparent|top|thin|thick|text|text-top|text-bottom|tb-rl|table-header-group|table-footer-group|sw-resize|super|strict|static|square|solid|small-caps|separate|se-resize|scroll|s-resize|rtl|row-resize|ridge|right|repeat|repeat-y|repeat-x|relative|progress|pointer|overline|outside|outset|oblique|nowrap|not-allowed|normal|none|nw-resize|no-repeat|no-drop|newspaper|ne-resize|n-resize|move|middle|medium|ltr|lr-tb|lowercase|lower-roman|lower-alpha|loose|list-item|line|line-through|line-edge|lighter|left|keep-all|justify|italic|inter-word|inter-ideograph|inside|inset|inline|inline-block|inherit|inactive|ideograph-space|ideograph-parenthesis|ideograph-numeric|ideograph-alpha|horizontal|hidden|help|hand|groove|fixed|ellipsis|e-resize|double|dotted|distribute|distribute-space|distribute-letter|distribute-all-lines|disc|disabled|default|decimal|dashed|crosshair|collapse|col-resize|circle|char|center|capitalize|break-word|break-all|bottom|both|bolder|bold|block|bidi-override|below|baseline|auto|always|all-scroll|absolute|table|table-cell)\\b'
      },
      {
        className: 'value',
        begin: ':', end: ';',
        contains: [
          FUNCTION,
          VARIABLE,
          HEXCOLOR,
          hljs.CSS_NUMBER_MODE,
          hljs.QUOTE_STRING_MODE,
          hljs.APOS_STRING_MODE,
          {
            className: 'important', begin: '!important'
          }
        ]
      },
      {
        className: 'at_rule',
        begin: '@', end: '[{;]',
        keywords: 'mixin include extend for if else each while charset import debug media page content font-face namespace warn',
        contains: [
          FUNCTION,
          VARIABLE,
          hljs.QUOTE_STRING_MODE,
          hljs.APOS_STRING_MODE,
          HEXCOLOR,
          hljs.CSS_NUMBER_MODE,
          {
            className: 'preprocessor',
            begin: '\\s[A-Za-z0-9_.-]+',
            relevance: 0
          }
        ]
      }
    ]
  };
}

},{}],12:[function(require,module,exports){
/*
Language: Smalltalk
Author: Vladimir Gubarkov <xonixx@gmail.com>
*/

module.exports = function(hljs) {
  var VAR_IDENT_RE = '[a-z][a-zA-Z0-9_]*';
  var CHAR = {
    className: 'char',
    begin: '\\$.{1}'
  };
  var SYMBOL = {
    className: 'symbol',
    begin: '#' + hljs.UNDERSCORE_IDENT_RE
  };
  return {
    aliases: ['st'],
    keywords: 'self super nil true false thisContext', // only 6
    contains: [
      hljs.COMMENT('"', '"'),
      hljs.APOS_STRING_MODE,
      {
        className: 'class',
        begin: '\\b[A-Z][A-Za-z0-9_]*',
        relevance: 0
      },
      {
        className: 'method',
        begin: VAR_IDENT_RE + ':',
        relevance: 0
      },
      hljs.C_NUMBER_MODE,
      SYMBOL,
      CHAR,
      {
        className: 'localvars',
        // This looks more complicated than needed to avoid combinatorial
        // explosion under V8. It effectively means `| var1 var2 ... |` with
        // whitespace adjacent to `|` being optional.
        begin: '\\|[ ]*' + VAR_IDENT_RE + '([ ]+' + VAR_IDENT_RE + ')*[ ]*\\|',
        returnBegin: true, end: /\|/,
        illegal: /\S/,
        contains: [{begin: '(\\|[ ]*)?' + VAR_IDENT_RE}]
      },
      {
        className: 'array',
        begin: '\\#\\(', end: '\\)',
        contains: [
          hljs.APOS_STRING_MODE,
          CHAR,
          hljs.C_NUMBER_MODE,
          SYMBOL
        ]
      }
    ]
  };
}

},{}],13:[function(require,module,exports){
module.exports = function() {

  'use strict';

  var
  VERSION = '0.1.3',

  /* This is the object, that holds the cached values */
  _storage = false,

  /* How much space does the storage take */
  _storage_size = 0,

  _storage_available = false,

  _ttl_timeout = null;

  // This method might throw as it touches localStorage and doing so
  // can be prohibited in some environments
  function _init() {

    // If localStorage does not exist, the following throws
    // This is intentional
    window.localStorage.setItem('__simpleStorageInitTest', 'tmpval');
    window.localStorage.removeItem('__simpleStorageInitTest');

    // Load data from storage
    _load_storage();

    // remove dead keys
    _handleTTL();

    // start listening for changes
    _setupUpdateObserver();

    // handle cached navigation
    if ('addEventListener' in window) {
      window.addEventListener('pageshow', function(event) {
        if (event.persisted) {
          _reloadData();
        }
      }, false);
    }

    _storage_available = true;
  }

  /**
     * Sets up a storage change observer
*/
  function _setupUpdateObserver() {
    if ('addEventListener' in window) {
      window.addEventListener('storage', _reloadData, false);
    } else {
      document.attachEvent('onstorage', _reloadData);
    }
  }

  /**
     * Reload data from storage when needed
*/
  function _reloadData() {
    try {
      _load_storage();
    } catch (E) {
      _storage_available = false;
      return;
    }
    _handleTTL();
  }

  function _load_storage() {
    var source = localStorage.getItem('simpleStorage');

    try {
      _storage = JSON.parse(source) || {};
    } catch (E) {
      _storage = {};
    }

    _storage_size = _get_storage_size();
  }

  function _save() {
    try {
      localStorage.setItem('simpleStorage', JSON.stringify(_storage));
      _storage_size = _get_storage_size();
    } catch (E) {
      return E;
    }
    return true;
  }

  function _get_storage_size() {
    var source = localStorage.getItem('simpleStorage');
    return source ? String(source).length : 0;
  }

  function _handleTTL() {
    var curtime, i, len, expire, keys, nextExpire = Infinity,
    expiredKeysCount = 0;

    clearTimeout(_ttl_timeout);

    if (!_storage || !_storage.__simpleStorage_meta || !_storage.__simpleStorage_meta.TTL) {
      return;
    }

    curtime = +new Date();
    keys = _storage.__simpleStorage_meta.TTL.keys || [];
    expire = _storage.__simpleStorage_meta.TTL.expire || {};

    for (i = 0, len = keys.length; i < len; i++) {
      if (expire[keys[i]] <= curtime) {
        expiredKeysCount++;
        delete _storage[keys[i]];
        delete expire[keys[i]];
      } else {
        if (expire[keys[i]] < nextExpire) {
          nextExpire = expire[keys[i]];
        }
        break;
      }
    }

    // set next check
    if (nextExpire != Infinity) {
      _ttl_timeout = setTimeout(_handleTTL, Math.min(nextExpire - curtime, 0x7FFFFFFF));
    }

    // remove expired from TTL list and save changes
    if (expiredKeysCount) {
      keys.splice(0, expiredKeysCount);

      _cleanMetaObject();
      _save();
    }
  }

  function _setTTL(key, ttl) {
    var curtime = +new Date(),
    i, len, added = false;

    ttl = Number(ttl) || 0;

    // Set TTL value for the key
    if (ttl !== 0) {
      // If key exists, set TTL
      if (_storage.hasOwnProperty(key)) {

        if (!_storage.__simpleStorage_meta) {
          _storage.__simpleStorage_meta = {};
        }

        if (!_storage.__simpleStorage_meta.TTL) {
          _storage.__simpleStorage_meta.TTL = {
            expire: {},
            keys: []
          };
        }

        _storage.__simpleStorage_meta.TTL.expire[key] = curtime + ttl;

        // find the expiring key in the array and remove it and all before it (because of sort)
        if (_storage.__simpleStorage_meta.TTL.expire.hasOwnProperty(key)) {
          for (i = 0, len = _storage.__simpleStorage_meta.TTL.keys.length; i < len; i++) {
            if (_storage.__simpleStorage_meta.TTL.keys[i] == key) {
              _storage.__simpleStorage_meta.TTL.keys.splice(i);
            }
          }
        }

        // add key to keys array preserving sort (soonest first)
        for (i = 0, len = _storage.__simpleStorage_meta.TTL.keys.length; i < len; i++) {
          if (_storage.__simpleStorage_meta.TTL.expire[_storage.__simpleStorage_meta.TTL.keys[i]] > (curtime + ttl)) {
            _storage.__simpleStorage_meta.TTL.keys.splice(i, 0, key);
            added = true;
            break;
          }
        }

        // if not added in previous loop, add here
        if (!added) {
          _storage.__simpleStorage_meta.TTL.keys.push(key);
        }
      } else {
        return false;
      }
    } else {
      // Remove TTL if set
      if (_storage && _storage.__simpleStorage_meta && _storage.__simpleStorage_meta.TTL) {

        if (_storage.__simpleStorage_meta.TTL.expire.hasOwnProperty(key)) {
          delete _storage.__simpleStorage_meta.TTL.expire[key];
          for (i = 0, len = _storage.__simpleStorage_meta.TTL.keys.length; i < len; i++) {
            if (_storage.__simpleStorage_meta.TTL.keys[i] == key) {
              _storage.__simpleStorage_meta.TTL.keys.splice(i, 1);
              break;
            }
          }
        }

        _cleanMetaObject();
      }
    }

    // schedule next TTL check
    clearTimeout(_ttl_timeout);
    if (_storage && _storage.__simpleStorage_meta && _storage.__simpleStorage_meta.TTL && _storage.__simpleStorage_meta.TTL.keys.length) {
      _ttl_timeout = setTimeout(_handleTTL, Math.min(Math.max(_storage.__simpleStorage_meta.TTL.expire[_storage.__simpleStorage_meta.TTL.keys[0]] - curtime, 0), 0x7FFFFFFF));
    }

    return true;
  }

  function _cleanMetaObject() {
    var updated = false,
    hasProperties = false,
    i;

    if (!_storage || !_storage.__simpleStorage_meta) {
      return updated;
    }

    // If nothing to TTL, remove the object
    if (_storage.__simpleStorage_meta.TTL && !_storage.__simpleStorage_meta.TTL.keys.length) {
      delete _storage.__simpleStorage_meta.TTL;
      updated = true;
    }

    // If meta object is empty, remove it
    for (i in _storage.__simpleStorage_meta) {
      if (_storage.__simpleStorage_meta.hasOwnProperty(i)) {
        hasProperties = true;
        break;
      }
    }

    if (!hasProperties) {
      delete _storage.__simpleStorage_meta;
      updated = true;
    }

    return updated;
  }

  ////////////////////////// PUBLIC INTERFACE /////////////////////////

  try {
    _init();
  } catch (E) {}

  return {

    version: VERSION,

    canUse: function() {
      return !!_storage_available;
    },

    set: function(key, value, options) {
      if (key == '__simpleStorage_meta') {
        return false;
      }

      if (!_storage) {
        return false;
      }

      // undefined values are deleted automatically
      if (typeof value == 'undefined') {
        return this.deleteKey(key);
      }

      options = options || {};

      // Check if the value is JSON compatible (and remove reference to existing objects/arrays)
      try {
        value = JSON.parse(JSON.stringify(value));
      } catch (E) {
        return E;
      }

      _storage[key] = value;

      _setTTL(key, options.TTL || 0);

      return _save();
    },

    get: function(key) {
      if (!_storage) {
        return false;
      }

      if (_storage.hasOwnProperty(key) && key != '__simpleStorage_meta') {
        // TTL value for an existing key is either a positive number or an Infinity
        if (this.getTTL(key)) {
          return _storage[key];
        }
      }
    },

    deleteKey: function(key) {

      if (!_storage) {
        return false;
      }

      if (key in _storage) {
        delete _storage[key];

        _setTTL(key, 0);

        return _save();
      }

      return false;
    },

    setTTL: function(key, ttl) {
      if (!_storage) {
        return false;
      }

      _setTTL(key, ttl);

      return _save();
    },

    getTTL: function(key) {
      var ttl;

      if (!_storage) {
        return false;
      }

      if (_storage.hasOwnProperty(key)) {
        if (_storage.__simpleStorage_meta &&
            _storage.__simpleStorage_meta.TTL &&
                _storage.__simpleStorage_meta.TTL.expire &&
                    _storage.__simpleStorage_meta.TTL.expire.hasOwnProperty(key)) {

          ttl = Math.max(_storage.__simpleStorage_meta.TTL.expire[key] - (+new Date()) || 0, 0);

          return ttl || false;
        } else {
          return Infinity;
        }
      }

      return false;
    },

    flush: function() {
      if (!_storage) {
        return false;
      }

      _storage = {};
      try {
        localStorage.removeItem('simpleStorage');
        return true;
      } catch (E) {
        return E;
      }
    },

    index: function() {
      if (!_storage) {
        return false;
      }

      var index = [],
      i;
      for (i in _storage) {
        if (_storage.hasOwnProperty(i) && i != '__simpleStorage_meta') {
          index.push(i);
        }
      }
      return index;
    },

    storageSize: function() {
      return _storage_size;
    }
  };
}();

},{}],14:[function(require,module,exports){
/*! wavesurfer.js 1.0.28
* https://github.com/katspaugh/wavesurfer.js
* @license CC-BY 3.0 */
"use strict";var WaveSurfer={defaultParams:{height:128,waveColor:"#999",progressColor:"#555",cursorColor:"#333",cursorWidth:1,skipLength:2,minPxPerSec:20,pixelRatio:window.devicePixelRatio,fillParent:!0,scrollParent:!1,hideScrollbar:!1,normalize:!1,audioContext:null,container:null,dragSelection:!0,loopSelection:!0,audioRate:1,interact:!0,splitChannels:!1,renderer:"Canvas",backend:"WebAudio",mediaType:"audio"},init:function(a){if(this.params=WaveSurfer.util.extend({},this.defaultParams,a),this.container="string"==typeof a.container?document.querySelector(this.params.container):this.params.container,!this.container)throw new Error("Container element not found");if(this.mediaContainer="undefined"==typeof this.params.mediaContainer?this.container:"string"==typeof this.params.mediaContainer?document.querySelector(this.params.mediaContainer):this.params.mediaContainer,!this.mediaContainer)throw new Error("Media Container element not found");this.savedVolume=0,this.isMuted=!1,this.tmpEvents=[],this.createDrawer(),this.createBackend()},createDrawer:function(){var a=this;this.drawer=Object.create(WaveSurfer.Drawer[this.params.renderer]),this.drawer.init(this.container,this.params),this.drawer.on("redraw",function(){a.drawBuffer(),a.drawer.progress(a.backend.getPlayedPercents())}),this.drawer.on("click",function(b,c){setTimeout(function(){a.seekTo(c)},0)}),this.drawer.on("scroll",function(b){a.fireEvent("scroll",b)})},createBackend:function(){var a=this;this.backend&&this.backend.destroy(),"AudioElement"==this.params.backend&&(this.params.backend="MediaElement"),"WebAudio"!=this.params.backend||WaveSurfer.WebAudio.supportsWebAudio()||(this.params.backend="MediaElement"),this.backend=Object.create(WaveSurfer[this.params.backend]),this.backend.init(this.params),this.backend.on("finish",function(){a.fireEvent("finish")}),this.backend.on("audioprocess",function(b){a.drawer.progress(a.backend.getPlayedPercents()),a.fireEvent("audioprocess",b)})},getDuration:function(){return this.backend.getDuration()},getCurrentTime:function(){return this.backend.getCurrentTime()},play:function(a,b){this.backend.play(a,b),this.fireEvent("play")},pause:function(){this.backend.pause(),this.fireEvent("pause")},playPause:function(){this.backend.isPaused()?this.play():this.pause()},isPlaying:function(){return!this.backend.isPaused()},skipBackward:function(a){this.skip(-a||-this.params.skipLength)},skipForward:function(a){this.skip(a||this.params.skipLength)},skip:function(a){var b=this.getCurrentTime()||0,c=this.getDuration()||1;b=Math.max(0,Math.min(c,b+(a||0))),this.seekAndCenter(b/c)},seekAndCenter:function(a){this.seekTo(a),this.drawer.recenter(a)},seekTo:function(a){var b=this.backend.isPaused(),c=this.params.scrollParent;b&&(this.params.scrollParent=!1),this.backend.seekTo(a*this.getDuration()),this.drawer.progress(this.backend.getPlayedPercents()),b||(this.backend.pause(),this.backend.play()),this.params.scrollParent=c,this.fireEvent("seek",a)},stop:function(){this.pause(),this.seekTo(0),this.drawer.progress(0)},setVolume:function(a){this.backend.setVolume(a)},setPlaybackRate:function(a){this.backend.setPlaybackRate(a)},toggleMute:function(){this.isMuted?(this.backend.setVolume(this.savedVolume),this.isMuted=!1):(this.savedVolume=this.backend.getVolume(),this.backend.setVolume(0),this.isMuted=!0)},toggleScroll:function(){this.params.scrollParent=!this.params.scrollParent,this.drawBuffer()},toggleInteraction:function(){this.params.interact=!this.params.interact},drawBuffer:function(){var a=Math.round(this.getDuration()*this.params.minPxPerSec*this.params.pixelRatio),b=this.drawer.getWidth(),c=a;this.params.fillParent&&(!this.params.scrollParent||b>a)&&(c=b);var d=this.backend.getPeaks(c);this.drawer.drawPeaks(d,c),this.fireEvent("redraw",d,c)},zoom:function(a){this.params.minPxPerSec=a,this.params.scrollParent=!0,this.drawBuffer(),this.seekAndCenter(this.getCurrentTime()/this.getDuration())},loadArrayBuffer:function(a){this.decodeArrayBuffer(a,function(a){this.loadDecodedBuffer(a)}.bind(this))},loadDecodedBuffer:function(a){this.backend.load(a),this.drawBuffer(),this.fireEvent("ready")},loadBlob:function(a){var b=this,c=new FileReader;c.addEventListener("progress",function(a){b.onProgress(a)}),c.addEventListener("load",function(a){b.loadArrayBuffer(a.target.result)}),c.addEventListener("error",function(){b.fireEvent("error","Error reading file")}),c.readAsArrayBuffer(a),this.empty()},load:function(a,b){switch(this.params.backend){case"WebAudio":return this.loadBuffer(a);case"MediaElement":return this.loadMediaElement(a,b)}},loadBuffer:function(a){return this.empty(),this.getArrayBuffer(a,this.loadArrayBuffer.bind(this))},loadMediaElement:function(a,b){this.empty(),this.backend.load(a,this.mediaContainer,b),this.tmpEvents.push(this.backend.once("canplay",function(){this.drawBuffer(),this.fireEvent("ready")}.bind(this)),this.backend.once("error",function(a){this.fireEvent("error",a)}.bind(this))),!b&&this.backend.supportsWebAudio()&&this.getArrayBuffer(a,function(a){this.decodeArrayBuffer(a,function(a){this.backend.buffer=a,this.drawBuffer()}.bind(this))}.bind(this))},decodeArrayBuffer:function(a,b){this.backend.decodeArrayBuffer(a,this.fireEvent.bind(this,"decoded"),this.fireEvent.bind(this,"error","Error decoding audiobuffer")),this.tmpEvents.push(this.once("decoded",b))},getArrayBuffer:function(a,b){var c=this,d=WaveSurfer.util.ajax({url:a,responseType:"arraybuffer"});return this.tmpEvents.push(d.on("progress",function(a){c.onProgress(a)}),d.on("success",b),d.on("error",function(a){c.fireEvent("error","XHR error: "+a.target.statusText)})),d},onProgress:function(a){if(a.lengthComputable)var b=a.loaded/a.total;else b=a.loaded/(a.loaded+1e6);this.fireEvent("loading",Math.round(100*b),a.target)},exportPCM:function(a,b,c){a=a||1024,b=b||1e4,c=c||!1;var d=this.backend.getPeaks(a,b),e=[].map.call(d,function(a){return Math.round(a*b)/b}),f=JSON.stringify(e);return c||window.open("data:application/json;charset=utf-8,"+encodeURIComponent(f)),f},clearTmpEvents:function(){this.tmpEvents.forEach(function(a){a.un()})},empty:function(){this.backend.isPaused()||(this.stop(),this.backend.disconnectSource()),this.clearTmpEvents(),this.drawer.progress(0),this.drawer.setWidth(0),this.drawer.drawPeaks({length:this.drawer.getWidth()},0)},destroy:function(){this.fireEvent("destroy"),this.clearTmpEvents(),this.unAll(),this.backend.destroy(),this.drawer.destroy()}};WaveSurfer.create=function(a){var b=Object.create(WaveSurfer);return b.init(a),b},WaveSurfer.util={extend:function(a){var b=Array.prototype.slice.call(arguments,1);return b.forEach(function(b){Object.keys(b).forEach(function(c){a[c]=b[c]})}),a},getId:function(){return"wavesurfer_"+Math.random().toString(32).substring(2)},ajax:function(a){var b=Object.create(WaveSurfer.Observer),c=new XMLHttpRequest,d=!1;return c.open(a.method||"GET",a.url,!0),c.responseType=a.responseType||"json",c.addEventListener("progress",function(a){b.fireEvent("progress",a),a.lengthComputable&&a.loaded==a.total&&(d=!0)}),c.addEventListener("load",function(a){d||b.fireEvent("progress",a),b.fireEvent("load",a),200==c.status||206==c.status?b.fireEvent("success",c.response,a):b.fireEvent("error",a)}),c.addEventListener("error",function(a){b.fireEvent("error",a)}),c.send(),b.xhr=c,b}},WaveSurfer.Observer={on:function(a,b){this.handlers||(this.handlers={});var c=this.handlers[a];return c||(c=this.handlers[a]=[]),c.push(b),{name:a,callback:b,un:this.un.bind(this,a,b)}},un:function(a,b){if(this.handlers){var c=this.handlers[a];if(c)if(b)for(var d=c.length-1;d>=0;d--)c[d]==b&&c.splice(d,1);else c.length=0}},unAll:function(){this.handlers=null},once:function(a,b){var c=this,d=function(){b.apply(this,arguments),setTimeout(function(){c.un(a,d)},0)};return this.on(a,d)},fireEvent:function(a){if(this.handlers){var b=this.handlers[a],c=Array.prototype.slice.call(arguments,1);b&&b.forEach(function(a){a.apply(null,c)})}}},WaveSurfer.util.extend(WaveSurfer,WaveSurfer.Observer),WaveSurfer.WebAudio={scriptBufferSize:256,PLAYING_STATE:0,PAUSED_STATE:1,FINISHED_STATE:2,supportsWebAudio:function(){return!(!window.AudioContext&&!window.webkitAudioContext)},getAudioContext:function(){return WaveSurfer.WebAudio.audioContext||(WaveSurfer.WebAudio.audioContext=new(window.AudioContext||window.webkitAudioContext)),WaveSurfer.WebAudio.audioContext},getOfflineAudioContext:function(a){return WaveSurfer.WebAudio.offlineAudioContext||(WaveSurfer.WebAudio.offlineAudioContext=new(window.OfflineAudioContext||window.webkitOfflineAudioContext)(1,2,a)),WaveSurfer.WebAudio.offlineAudioContext},init:function(a){this.params=a,this.ac=a.audioContext||this.getAudioContext(),this.lastPlay=this.ac.currentTime,this.startPosition=0,this.scheduledPause=null,this.states=[Object.create(WaveSurfer.WebAudio.state.playing),Object.create(WaveSurfer.WebAudio.state.paused),Object.create(WaveSurfer.WebAudio.state.finished)],this.createVolumeNode(),this.createScriptNode(),this.createAnalyserNode(),this.setState(this.PAUSED_STATE),this.setPlaybackRate(this.params.audioRate)},disconnectFilters:function(){this.filters&&(this.filters.forEach(function(a){a&&a.disconnect()}),this.filters=null,this.analyser.connect(this.gainNode))},setState:function(a){this.state!==this.states[a]&&(this.state=this.states[a],this.state.init.call(this))},setFilter:function(){this.setFilters([].slice.call(arguments))},setFilters:function(a){this.disconnectFilters(),a&&a.length&&(this.filters=a,this.analyser.disconnect(),a.reduce(function(a,b){return a.connect(b),b},this.analyser).connect(this.gainNode))},createScriptNode:function(){this.scriptNode=this.ac.createScriptProcessor?this.ac.createScriptProcessor(this.scriptBufferSize):this.ac.createJavaScriptNode(this.scriptBufferSize),this.scriptNode.connect(this.ac.destination)},addOnAudioProcess:function(){var a=this;this.scriptNode.onaudioprocess=function(){var b=a.getCurrentTime();b>=a.getDuration()?a.setState(a.FINISHED_STATE):b>=a.scheduledPause?a.setState(a.PAUSED_STATE):a.state===a.states[a.PLAYING_STATE]&&a.fireEvent("audioprocess",b)}},removeOnAudioProcess:function(){this.scriptNode.onaudioprocess=null},createAnalyserNode:function(){this.analyser=this.ac.createAnalyser(),this.analyser.connect(this.gainNode)},createVolumeNode:function(){this.gainNode=this.ac.createGain?this.ac.createGain():this.ac.createGainNode(),this.gainNode.connect(this.ac.destination)},setVolume:function(a){this.gainNode.gain.value=a},getVolume:function(){return this.gainNode.gain.value},decodeArrayBuffer:function(a,b,c){this.offlineAc||(this.offlineAc=this.getOfflineAudioContext(this.ac?this.ac.sampleRate:44100)),this.offlineAc.decodeAudioData(a,function(a){b(a)}.bind(this),c)},getPeaks:function(a){for(var b=this.buffer.length/a,c=~~(b/10)||1,d=this.buffer.numberOfChannels,e=[],f=[],g=0;d>g;g++)for(var h=e[g]=[],i=this.buffer.getChannelData(g),j=0;a>j;j++){for(var k=~~(j*b),l=~~(k+b),m=0,n=k;l>n;n+=c){var o=i[n];o>m?m=o:-o>m&&(m=-o)}h[j]=m,(0==g||m>f[j])&&(f[j]=m)}return this.params.splitChannels?e:f},getPlayedPercents:function(){return this.state.getPlayedPercents.call(this)},disconnectSource:function(){this.source&&this.source.disconnect()},destroy:function(){this.isPaused()||this.pause(),this.unAll(),this.buffer=null,this.disconnectFilters(),this.disconnectSource(),this.gainNode.disconnect(),this.scriptNode.disconnect(),this.analyser.disconnect()},load:function(a){this.startPosition=0,this.lastPlay=this.ac.currentTime,this.buffer=a,this.createSource()},createSource:function(){this.disconnectSource(),this.source=this.ac.createBufferSource(),this.source.start=this.source.start||this.source.noteGrainOn,this.source.stop=this.source.stop||this.source.noteOff,this.source.playbackRate.value=this.playbackRate,this.source.buffer=this.buffer,this.source.connect(this.analyser)},isPaused:function(){return this.state!==this.states[this.PLAYING_STATE]},getDuration:function(){return this.buffer?this.buffer.duration:0},seekTo:function(a,b){return this.scheduledPause=null,null==a&&(a=this.getCurrentTime(),a>=this.getDuration()&&(a=0)),null==b&&(b=this.getDuration()),this.startPosition=a,this.lastPlay=this.ac.currentTime,this.state===this.states[this.FINISHED_STATE]&&this.setState(this.PAUSED_STATE),{start:a,end:b}},getPlayedTime:function(){return(this.ac.currentTime-this.lastPlay)*this.playbackRate},play:function(a,b){this.createSource();var c=this.seekTo(a,b);a=c.start,b=c.end,this.scheduledPause=b,this.source.start(0,a,b-a),this.setState(this.PLAYING_STATE)},pause:function(){this.scheduledPause=null,this.startPosition+=this.getPlayedTime(),this.source&&this.source.stop(0),this.setState(this.PAUSED_STATE)},getCurrentTime:function(){return this.state.getCurrentTime.call(this)},setPlaybackRate:function(a){a=a||1,this.isPaused()?this.playbackRate=a:(this.pause(),this.playbackRate=a,this.play())}},WaveSurfer.WebAudio.state={},WaveSurfer.WebAudio.state.playing={init:function(){this.addOnAudioProcess()},getPlayedPercents:function(){var a=this.getDuration();return this.getCurrentTime()/a||0},getCurrentTime:function(){return this.startPosition+this.getPlayedTime()}},WaveSurfer.WebAudio.state.paused={init:function(){this.removeOnAudioProcess()},getPlayedPercents:function(){var a=this.getDuration();return this.getCurrentTime()/a||0},getCurrentTime:function(){return this.startPosition}},WaveSurfer.WebAudio.state.finished={init:function(){this.removeOnAudioProcess(),this.fireEvent("finish")},getPlayedPercents:function(){return 1},getCurrentTime:function(){return this.getDuration()}},WaveSurfer.util.extend(WaveSurfer.WebAudio,WaveSurfer.Observer),WaveSurfer.MediaElement=Object.create(WaveSurfer.WebAudio),WaveSurfer.util.extend(WaveSurfer.MediaElement,{init:function(a){this.params=a,this.media={currentTime:0,duration:0,paused:!0,playbackRate:1,play:function(){},pause:function(){}},this.mediaType=a.mediaType.toLowerCase(),this.elementPosition=a.elementPosition},load:function(a,b,c){var d=this,e=document.createElement(this.mediaType);e.controls=!1,e.autoplay=!1,e.preload="auto",e.src=a,e.addEventListener("error",function(){d.fireEvent("error","Error loading media element")}),e.addEventListener("canplay",function(){d.fireEvent("canplay")}),e.addEventListener("ended",function(){d.fireEvent("finish")}),e.addEventListener("timeupdate",function(){d.fireEvent("audioprocess",d.getCurrentTime())});var f=b.querySelector(this.mediaType);f&&b.removeChild(f),b.appendChild(e),this.media=e,this.peaks=c,this.onPlayEnd=null,this.buffer=null,this.setPlaybackRate(this.playbackRate)},isPaused:function(){return this.media.paused},getDuration:function(){var a=this.media.duration;return a>=1/0&&(a=this.media.seekable.end()),a},getCurrentTime:function(){return this.media.currentTime},getPlayedPercents:function(){return this.getCurrentTime()/this.getDuration()||0},setPlaybackRate:function(a){this.playbackRate=a||1,this.media.playbackRate=this.playbackRate},seekTo:function(a){null!=a&&(this.media.currentTime=a),this.clearPlayEnd()},play:function(a,b){this.seekTo(a),this.media.play(),b&&this.setPlayEnd(b)},pause:function(){this.media.pause(),this.clearPlayEnd()},setPlayEnd:function(a){var b=this;this.onPlayEnd=function(c){c>=a&&(b.pause(),b.seekTo(a))},this.on("audioprocess",this.onPlayEnd)},clearPlayEnd:function(){this.onPlayEnd&&(this.un("audioprocess",this.onPlayEnd),this.onPlayEnd=null)},getPeaks:function(a){return this.buffer?WaveSurfer.WebAudio.getPeaks.call(this,a):this.peaks||[]},getVolume:function(){return this.media.volume},setVolume:function(a){this.media.volume=a},destroy:function(){this.pause(),this.unAll(),this.media.parentNode&&this.media.parentNode.removeChild(this.media),this.media=null}}),WaveSurfer.AudioElement=WaveSurfer.MediaElement,WaveSurfer.Drawer={init:function(a,b){this.container=a,this.params=b,this.width=0,this.height=b.height*this.params.pixelRatio,this.lastPos=0,this.createWrapper(),this.createElements()},createWrapper:function(){this.wrapper=this.container.appendChild(document.createElement("wave")),this.style(this.wrapper,{display:"block",position:"relative",userSelect:"none",webkitUserSelect:"none",height:this.params.height+"px"}),(this.params.fillParent||this.params.scrollParent)&&this.style(this.wrapper,{width:"100%",overflowX:this.params.hideScrollbar?"hidden":"auto",overflowY:"hidden"}),this.setupWrapperEvents()},handleEvent:function(a){a.preventDefault();var b=this.wrapper.getBoundingClientRect();return(a.clientX-b.left+this.wrapper.scrollLeft)/this.wrapper.scrollWidth||0},setupWrapperEvents:function(){var a=this;this.wrapper.addEventListener("click",function(b){var c=a.wrapper.offsetHeight-a.wrapper.clientHeight;if(0!=c){var d=a.wrapper.getBoundingClientRect();if(b.clientY>=d.bottom-c)return}a.params.interact&&a.fireEvent("click",b,a.handleEvent(b))}),this.wrapper.addEventListener("scroll",function(b){a.fireEvent("scroll",b)})},drawPeaks:function(a,b){this.resetScroll(),this.setWidth(b),this.drawWave(a)},style:function(a,b){return Object.keys(b).forEach(function(c){a.style[c]!==b[c]&&(a.style[c]=b[c])}),a},resetScroll:function(){null!==this.wrapper&&(this.wrapper.scrollLeft=0)},recenter:function(a){var b=this.wrapper.scrollWidth*a;this.recenterOnPosition(b,!0)},recenterOnPosition:function(a,b){var c=this.wrapper.scrollLeft,d=~~(this.wrapper.clientWidth/2),e=a-d,f=e-c,g=this.wrapper.scrollWidth-this.wrapper.clientWidth;if(0!=g){if(!b&&f>=-d&&d>f){var h=5;f=Math.max(-h,Math.min(h,f)),e=c+f}e=Math.max(0,Math.min(g,e)),e!=c&&(this.wrapper.scrollLeft=e)}},getWidth:function(){return Math.round(this.container.clientWidth*this.params.pixelRatio)},setWidth:function(a){a!=this.width&&(this.width=a,this.params.fillParent||this.params.scrollParent?this.style(this.wrapper,{width:""}):this.style(this.wrapper,{width:~~(this.width/this.params.pixelRatio)+"px"}),this.updateSize())},setHeight:function(a){a!=this.height&&(this.height=a,this.style(this.wrapper,{height:~~(this.height/this.params.pixelRatio)+"px"}),this.updateSize())},progress:function(a){var b=1/this.params.pixelRatio,c=Math.round(a*this.width)*b;if(c<this.lastPos||c-this.lastPos>=b){if(this.lastPos=c,this.params.scrollParent){var d=~~(this.wrapper.scrollWidth*a);this.recenterOnPosition(d)}this.updateProgress(a)}},destroy:function(){this.unAll(),this.wrapper&&(this.container.removeChild(this.wrapper),this.wrapper=null)},createElements:function(){},updateSize:function(){},drawWave:function(){},clearWave:function(){},updateProgress:function(){}},WaveSurfer.util.extend(WaveSurfer.Drawer,WaveSurfer.Observer),WaveSurfer.Drawer.Canvas=Object.create(WaveSurfer.Drawer),WaveSurfer.util.extend(WaveSurfer.Drawer.Canvas,{createElements:function(){var a=this.wrapper.appendChild(this.style(document.createElement("canvas"),{position:"absolute",zIndex:1,left:0,top:0,bottom:0}));if(this.waveCc=a.getContext("2d"),this.progressWave=this.wrapper.appendChild(this.style(document.createElement("wave"),{position:"absolute",zIndex:2,left:0,top:0,bottom:0,overflow:"hidden",width:"0",display:"none",boxSizing:"border-box",borderRightStyle:"solid",borderRightWidth:this.params.cursorWidth+"px",borderRightColor:this.params.cursorColor})),this.params.waveColor!=this.params.progressColor){var b=this.progressWave.appendChild(document.createElement("canvas"));this.progressCc=b.getContext("2d")}},updateSize:function(){var a=Math.round(this.width/this.params.pixelRatio);this.waveCc.canvas.width=this.width,this.waveCc.canvas.height=this.height,this.style(this.waveCc.canvas,{width:a+"px"}),this.style(this.progressWave,{display:"block"}),this.progressCc&&(this.progressCc.canvas.width=this.width,this.progressCc.canvas.height=this.height,this.style(this.progressCc.canvas,{width:a+"px"})),this.clearWave()},clearWave:function(){this.waveCc.clearRect(0,0,this.width,this.height),this.progressCc&&this.progressCc.clearRect(0,0,this.width,this.height)},drawWave:function(a,b){if(a[0]instanceof Array){var c=a;if(this.params.splitChannels)return this.setHeight(c.length*this.params.height*this.params.pixelRatio),void c.forEach(this.drawWave,this);a=c[0]}var d=.5/this.params.pixelRatio,e=this.params.height*this.params.pixelRatio,f=e*b||0,g=e/2,h=a.length,i=1;this.params.fillParent&&this.width!=h&&(i=this.width/h);var j=1;this.params.normalize&&(j=Math.max.apply(Math,a)),this.waveCc.fillStyle=this.params.waveColor,this.progressCc&&(this.progressCc.fillStyle=this.params.progressColor),[this.waveCc,this.progressCc].forEach(function(b){if(b){b.beginPath(),b.moveTo(d,g+f);for(var c=0;h>c;c++){var e=Math.round(a[c]/j*g);b.lineTo(c*i+d,g+e+f)}b.lineTo(this.width+d,g+f),b.moveTo(d,g+f);for(var c=0;h>c;c++){var e=Math.round(a[c]/j*g);b.lineTo(c*i+d,g-e+f)}b.lineTo(this.width+d,g+f),b.closePath(),b.fill(),b.fillRect(0,g+f-d,this.width,d)}},this)},updateProgress:function(a){var b=Math.round(this.width*a)/this.params.pixelRatio;this.style(this.progressWave,{width:b+"px"})}});
//# sourceMappingURL=wavesurfer.min.js.map
module.exports = WaveSurfer;

},{}],15:[function(require,module,exports){
/* Zepto v1.1.3 - zepto event ajax form ie - zeptojs.com/license */
var Zepto=function(){function L(t){return null==t?String(t):j[T.call(t)]||"object"}function Z(t){return"function"==L(t)}function $(t){return null!=t&&t==t.window}function _(t){return null!=t&&t.nodeType==t.DOCUMENT_NODE}function D(t){return"object"==L(t)}function R(t){return D(t)&&!$(t)&&Object.getPrototypeOf(t)==Object.prototype}function M(t){return"number"==typeof t.length}function k(t){return s.call(t,function(t){return null!=t})}function z(t){return t.length>0?n.fn.concat.apply([],t):t}function F(t){return t.replace(/::/g,"/").replace(/([A-Z]+)([A-Z][a-z])/g,"$1_$2").replace(/([a-z\d])([A-Z])/g,"$1_$2").replace(/_/g,"-").toLowerCase()}function q(t){return t in f?f[t]:f[t]=new RegExp("(^|\\s)"+t+"(\\s|$)")}function H(t,e){return"number"!=typeof e||c[F(t)]?e:e+"px"}function I(t){var e,n;return u[t]||(e=a.createElement(t),a.body.appendChild(e),n=getComputedStyle(e,"").getPropertyValue("display"),e.parentNode.removeChild(e),"none"==n&&(n="block"),u[t]=n),u[t]}function V(t){return"children"in t?o.call(t.children):n.map(t.childNodes,function(t){return 1==t.nodeType?t:void 0})}function U(n,i,r){for(e in i)r&&(R(i[e])||A(i[e]))?(R(i[e])&&!R(n[e])&&(n[e]={}),A(i[e])&&!A(n[e])&&(n[e]=[]),U(n[e],i[e],r)):i[e]!==t&&(n[e]=i[e])}function B(t,e){return null==e?n(t):n(t).filter(e)}function J(t,e,n,i){return Z(e)?e.call(t,n,i):e}function X(t,e,n){null==n?t.removeAttribute(e):t.setAttribute(e,n)}function W(e,n){var i=e.className,r=i&&i.baseVal!==t;return n===t?r?i.baseVal:i:void(r?i.baseVal=n:e.className=n)}function Y(t){var e;try{return t?"true"==t||("false"==t?!1:"null"==t?null:/^0/.test(t)||isNaN(e=Number(t))?/^[\[\{]/.test(t)?n.parseJSON(t):t:e):t}catch(i){return t}}function G(t,e){e(t);for(var n in t.childNodes)G(t.childNodes[n],e)}var t,e,n,i,C,N,r=[],o=r.slice,s=r.filter,a=window.document,u={},f={},c={"column-count":1,columns:1,"font-weight":1,"line-height":1,opacity:1,"z-index":1,zoom:1},l=/^\s*<(\w+|!)[^>]*>/,h=/^<(\w+)\s*\/?>(?:<\/\1>|)$/,p=/<(?!area|br|col|embed|hr|img|input|link|meta|param)(([\w:]+)[^>]*)\/>/gi,d=/^(?:body|html)$/i,m=/([A-Z])/g,g=["val","css","html","text","data","width","height","offset"],v=["after","prepend","before","append"],y=a.createElement("table"),x=a.createElement("tr"),b={tr:a.createElement("tbody"),tbody:y,thead:y,tfoot:y,td:x,th:x,"*":a.createElement("div")},w=/complete|loaded|interactive/,E=/^[\w-]*$/,j={},T=j.toString,S={},O=a.createElement("div"),P={tabindex:"tabIndex",readonly:"readOnly","for":"htmlFor","class":"className",maxlength:"maxLength",cellspacing:"cellSpacing",cellpadding:"cellPadding",rowspan:"rowSpan",colspan:"colSpan",usemap:"useMap",frameborder:"frameBorder",contenteditable:"contentEditable"},A=Array.isArray||function(t){return t instanceof Array};return S.matches=function(t,e){if(!e||!t||1!==t.nodeType)return!1;var n=t.webkitMatchesSelector||t.mozMatchesSelector||t.oMatchesSelector||t.matchesSelector;if(n)return n.call(t,e);var i,r=t.parentNode,o=!r;return o&&(r=O).appendChild(t),i=~S.qsa(r,e).indexOf(t),o&&O.removeChild(t),i},C=function(t){return t.replace(/-+(.)?/g,function(t,e){return e?e.toUpperCase():""})},N=function(t){return s.call(t,function(e,n){return t.indexOf(e)==n})},S.fragment=function(e,i,r){var s,u,f;return h.test(e)&&(s=n(a.createElement(RegExp.$1))),s||(e.replace&&(e=e.replace(p,"<$1></$2>")),i===t&&(i=l.test(e)&&RegExp.$1),i in b||(i="*"),f=b[i],f.innerHTML=""+e,s=n.each(o.call(f.childNodes),function(){f.removeChild(this)})),R(r)&&(u=n(s),n.each(r,function(t,e){g.indexOf(t)>-1?u[t](e):u.attr(t,e)})),s},S.Z=function(t,e){return t=t||[],t.__proto__=n.fn,t.selector=e||"",t},S.isZ=function(t){return t instanceof S.Z},S.init=function(e,i){var r;if(!e)return S.Z();if("string"==typeof e)if(e=e.trim(),"<"==e[0]&&l.test(e))r=S.fragment(e,RegExp.$1,i),e=null;else{if(i!==t)return n(i).find(e);r=S.qsa(a,e)}else{if(Z(e))return n(a).ready(e);if(S.isZ(e))return e;if(A(e))r=k(e);else if(D(e))r=[e],e=null;else if(l.test(e))r=S.fragment(e.trim(),RegExp.$1,i),e=null;else{if(i!==t)return n(i).find(e);r=S.qsa(a,e)}}return S.Z(r,e)},n=function(t,e){return S.init(t,e)},n.extend=function(t){var e,n=o.call(arguments,1);return"boolean"==typeof t&&(e=t,t=n.shift()),n.forEach(function(n){U(t,n,e)}),t},S.qsa=function(t,e){var n,i="#"==e[0],r=!i&&"."==e[0],s=i||r?e.slice(1):e,a=E.test(s);return _(t)&&a&&i?(n=t.getElementById(s))?[n]:[]:1!==t.nodeType&&9!==t.nodeType?[]:o.call(a&&!i?r?t.getElementsByClassName(s):t.getElementsByTagName(e):t.querySelectorAll(e))},n.contains=function(t,e){return t!==e&&t.contains(e)},n.type=L,n.isFunction=Z,n.isWindow=$,n.isArray=A,n.isPlainObject=R,n.isEmptyObject=function(t){var e;for(e in t)return!1;return!0},n.inArray=function(t,e,n){return r.indexOf.call(e,t,n)},n.camelCase=C,n.trim=function(t){return null==t?"":String.prototype.trim.call(t)},n.uuid=0,n.support={},n.expr={},n.map=function(t,e){var n,r,o,i=[];if(M(t))for(r=0;r<t.length;r++)n=e(t[r],r),null!=n&&i.push(n);else for(o in t)n=e(t[o],o),null!=n&&i.push(n);return z(i)},n.each=function(t,e){var n,i;if(M(t)){for(n=0;n<t.length;n++)if(e.call(t[n],n,t[n])===!1)return t}else for(i in t)if(e.call(t[i],i,t[i])===!1)return t;return t},n.grep=function(t,e){return s.call(t,e)},window.JSON&&(n.parseJSON=JSON.parse),n.each("Boolean Number String Function Array Date RegExp Object Error".split(" "),function(t,e){j["[object "+e+"]"]=e.toLowerCase()}),n.fn={forEach:r.forEach,reduce:r.reduce,push:r.push,sort:r.sort,indexOf:r.indexOf,concat:r.concat,map:function(t){return n(n.map(this,function(e,n){return t.call(e,n,e)}))},slice:function(){return n(o.apply(this,arguments))},ready:function(t){return w.test(a.readyState)&&a.body?t(n):a.addEventListener("DOMContentLoaded",function(){t(n)},!1),this},get:function(e){return e===t?o.call(this):this[e>=0?e:e+this.length]},toArray:function(){return this.get()},size:function(){return this.length},remove:function(){return this.each(function(){null!=this.parentNode&&this.parentNode.removeChild(this)})},each:function(t){return r.every.call(this,function(e,n){return t.call(e,n,e)!==!1}),this},filter:function(t){return Z(t)?this.not(this.not(t)):n(s.call(this,function(e){return S.matches(e,t)}))},add:function(t,e){return n(N(this.concat(n(t,e))))},is:function(t){return this.length>0&&S.matches(this[0],t)},not:function(e){var i=[];if(Z(e)&&e.call!==t)this.each(function(t){e.call(this,t)||i.push(this)});else{var r="string"==typeof e?this.filter(e):M(e)&&Z(e.item)?o.call(e):n(e);this.forEach(function(t){r.indexOf(t)<0&&i.push(t)})}return n(i)},has:function(t){return this.filter(function(){return D(t)?n.contains(this,t):n(this).find(t).size()})},eq:function(t){return-1===t?this.slice(t):this.slice(t,+t+1)},first:function(){var t=this[0];return t&&!D(t)?t:n(t)},last:function(){var t=this[this.length-1];return t&&!D(t)?t:n(t)},find:function(t){var e,i=this;return e="object"==typeof t?n(t).filter(function(){var t=this;return r.some.call(i,function(e){return n.contains(e,t)})}):1==this.length?n(S.qsa(this[0],t)):this.map(function(){return S.qsa(this,t)})},closest:function(t,e){var i=this[0],r=!1;for("object"==typeof t&&(r=n(t));i&&!(r?r.indexOf(i)>=0:S.matches(i,t));)i=i!==e&&!_(i)&&i.parentNode;return n(i)},parents:function(t){for(var e=[],i=this;i.length>0;)i=n.map(i,function(t){return(t=t.parentNode)&&!_(t)&&e.indexOf(t)<0?(e.push(t),t):void 0});return B(e,t)},parent:function(t){return B(N(this.pluck("parentNode")),t)},children:function(t){return B(this.map(function(){return V(this)}),t)},contents:function(){return this.map(function(){return o.call(this.childNodes)})},siblings:function(t){return B(this.map(function(t,e){return s.call(V(e.parentNode),function(t){return t!==e})}),t)},empty:function(){return this.each(function(){this.innerHTML=""})},pluck:function(t){return n.map(this,function(e){return e[t]})},show:function(){return this.each(function(){"none"==this.style.display&&(this.style.display=""),"none"==getComputedStyle(this,"").getPropertyValue("display")&&(this.style.display=I(this.nodeName))})},replaceWith:function(t){return this.before(t).remove()},wrap:function(t){var e=Z(t);if(this[0]&&!e)var i=n(t).get(0),r=i.parentNode||this.length>1;return this.each(function(o){n(this).wrapAll(e?t.call(this,o):r?i.cloneNode(!0):i)})},wrapAll:function(t){if(this[0]){n(this[0]).before(t=n(t));for(var e;(e=t.children()).length;)t=e.first();n(t).append(this)}return this},wrapInner:function(t){var e=Z(t);return this.each(function(i){var r=n(this),o=r.contents(),s=e?t.call(this,i):t;o.length?o.wrapAll(s):r.append(s)})},unwrap:function(){return this.parent().each(function(){n(this).replaceWith(n(this).children())}),this},clone:function(){return this.map(function(){return this.cloneNode(!0)})},hide:function(){return this.css("display","none")},toggle:function(e){return this.each(function(){var i=n(this);(e===t?"none"==i.css("display"):e)?i.show():i.hide()})},prev:function(t){return n(this.pluck("previousElementSibling")).filter(t||"*")},next:function(t){return n(this.pluck("nextElementSibling")).filter(t||"*")},html:function(t){return 0===arguments.length?this.length>0?this[0].innerHTML:null:this.each(function(e){var i=this.innerHTML;n(this).empty().append(J(this,t,e,i))})},text:function(e){return 0===arguments.length?this.length>0?this[0].textContent:null:this.each(function(){this.textContent=e===t?"":""+e})},attr:function(n,i){var r;return"string"==typeof n&&i===t?0==this.length||1!==this[0].nodeType?t:"value"==n&&"INPUT"==this[0].nodeName?this.val():!(r=this[0].getAttribute(n))&&n in this[0]?this[0][n]:r:this.each(function(t){if(1===this.nodeType)if(D(n))for(e in n)X(this,e,n[e]);else X(this,n,J(this,i,t,this.getAttribute(n)))})},removeAttr:function(t){return this.each(function(){1===this.nodeType&&X(this,t)})},prop:function(e,n){return e=P[e]||e,n===t?this[0]&&this[0][e]:this.each(function(t){this[e]=J(this,n,t,this[e])})},data:function(e,n){var i=this.attr("data-"+e.replace(m,"-$1").toLowerCase(),n);return null!==i?Y(i):t},val:function(t){return 0===arguments.length?this[0]&&(this[0].multiple?n(this[0]).find("option").filter(function(){return this.selected}).pluck("value"):this[0].value):this.each(function(e){this.value=J(this,t,e,this.value)})},offset:function(t){if(t)return this.each(function(e){var i=n(this),r=J(this,t,e,i.offset()),o=i.offsetParent().offset(),s={top:r.top-o.top,left:r.left-o.left};"static"==i.css("position")&&(s.position="relative"),i.css(s)});if(0==this.length)return null;var e=this[0].getBoundingClientRect();return{left:e.left+window.pageXOffset,top:e.top+window.pageYOffset,width:Math.round(e.width),height:Math.round(e.height)}},css:function(t,i){if(arguments.length<2){var r=this[0],o=getComputedStyle(r,"");if(!r)return;if("string"==typeof t)return r.style[C(t)]||o.getPropertyValue(t);if(A(t)){var s={};return n.each(A(t)?t:[t],function(t,e){s[e]=r.style[C(e)]||o.getPropertyValue(e)}),s}}var a="";if("string"==L(t))i||0===i?a=F(t)+":"+H(t,i):this.each(function(){this.style.removeProperty(F(t))});else for(e in t)t[e]||0===t[e]?a+=F(e)+":"+H(e,t[e])+";":this.each(function(){this.style.removeProperty(F(e))});return this.each(function(){this.style.cssText+=";"+a})},index:function(t){return t?this.indexOf(n(t)[0]):this.parent().children().indexOf(this[0])},hasClass:function(t){return t?r.some.call(this,function(t){return this.test(W(t))},q(t)):!1},addClass:function(t){return t?this.each(function(e){i=[];var r=W(this),o=J(this,t,e,r);o.split(/\s+/g).forEach(function(t){n(this).hasClass(t)||i.push(t)},this),i.length&&W(this,r+(r?" ":"")+i.join(" "))}):this},removeClass:function(e){return this.each(function(n){return e===t?W(this,""):(i=W(this),J(this,e,n,i).split(/\s+/g).forEach(function(t){i=i.replace(q(t)," ")}),void W(this,i.trim()))})},toggleClass:function(e,i){return e?this.each(function(r){var o=n(this),s=J(this,e,r,W(this));s.split(/\s+/g).forEach(function(e){(i===t?!o.hasClass(e):i)?o.addClass(e):o.removeClass(e)})}):this},scrollTop:function(e){if(this.length){var n="scrollTop"in this[0];return e===t?n?this[0].scrollTop:this[0].pageYOffset:this.each(n?function(){this.scrollTop=e}:function(){this.scrollTo(this.scrollX,e)})}},scrollLeft:function(e){if(this.length){var n="scrollLeft"in this[0];return e===t?n?this[0].scrollLeft:this[0].pageXOffset:this.each(n?function(){this.scrollLeft=e}:function(){this.scrollTo(e,this.scrollY)})}},position:function(){if(this.length){var t=this[0],e=this.offsetParent(),i=this.offset(),r=d.test(e[0].nodeName)?{top:0,left:0}:e.offset();return i.top-=parseFloat(n(t).css("margin-top"))||0,i.left-=parseFloat(n(t).css("margin-left"))||0,r.top+=parseFloat(n(e[0]).css("border-top-width"))||0,r.left+=parseFloat(n(e[0]).css("border-left-width"))||0,{top:i.top-r.top,left:i.left-r.left}}},offsetParent:function(){return this.map(function(){for(var t=this.offsetParent||a.body;t&&!d.test(t.nodeName)&&"static"==n(t).css("position");)t=t.offsetParent;return t})}},n.fn.detach=n.fn.remove,["width","height"].forEach(function(e){var i=e.replace(/./,function(t){return t[0].toUpperCase()});n.fn[e]=function(r){var o,s=this[0];return r===t?$(s)?s["inner"+i]:_(s)?s.documentElement["scroll"+i]:(o=this.offset())&&o[e]:this.each(function(t){s=n(this),s.css(e,J(this,r,t,s[e]()))})}}),v.forEach(function(t,e){var i=e%2;n.fn[t]=function(){var t,o,r=n.map(arguments,function(e){return t=L(e),"object"==t||"array"==t||null==e?e:S.fragment(e)}),s=this.length>1;return r.length<1?this:this.each(function(t,a){o=i?a:a.parentNode,a=0==e?a.nextSibling:1==e?a.firstChild:2==e?a:null,r.forEach(function(t){if(s)t=t.cloneNode(!0);else if(!o)return n(t).remove();G(o.insertBefore(t,a),function(t){null==t.nodeName||"SCRIPT"!==t.nodeName.toUpperCase()||t.type&&"text/javascript"!==t.type||t.src||window.eval.call(window,t.innerHTML)})})})},n.fn[i?t+"To":"insert"+(e?"Before":"After")]=function(e){return n(e)[t](this),this}}),S.Z.prototype=n.fn,S.uniq=N,S.deserializeValue=Y,n.zepto=S,n}();window.Zepto=Zepto,void 0===window.$&&(window.$=Zepto),function(t){function l(t){return t._zid||(t._zid=e++)}function h(t,e,n,i){if(e=p(e),e.ns)var r=d(e.ns);return(s[l(t)]||[]).filter(function(t){return!(!t||e.e&&t.e!=e.e||e.ns&&!r.test(t.ns)||n&&l(t.fn)!==l(n)||i&&t.sel!=i)})}function p(t){var e=(""+t).split(".");return{e:e[0],ns:e.slice(1).sort().join(" ")}}function d(t){return new RegExp("(?:^| )"+t.replace(" "," .* ?")+"(?: |$)")}function m(t,e){return t.del&&!u&&t.e in f||!!e}function g(t){return c[t]||u&&f[t]||t}function v(e,i,r,o,a,u,f){var h=l(e),d=s[h]||(s[h]=[]);i.split(/\s/).forEach(function(i){if("ready"==i)return t(document).ready(r);var s=p(i);s.fn=r,s.sel=a,s.e in c&&(r=function(e){var n=e.relatedTarget;return!n||n!==this&&!t.contains(this,n)?s.fn.apply(this,arguments):void 0}),s.del=u;var l=u||r;s.proxy=function(t){if(t=j(t),!t.isImmediatePropagationStopped()){t.data=o;var i=l.apply(e,t._args==n?[t]:[t].concat(t._args));return i===!1&&(t.preventDefault(),t.stopPropagation()),i}},s.i=d.length,d.push(s),"addEventListener"in e&&e.addEventListener(g(s.e),s.proxy,m(s,f))})}function y(t,e,n,i,r){var o=l(t);(e||"").split(/\s/).forEach(function(e){h(t,e,n,i).forEach(function(e){delete s[o][e.i],"removeEventListener"in t&&t.removeEventListener(g(e.e),e.proxy,m(e,r))})})}function j(e,i){return(i||!e.isDefaultPrevented)&&(i||(i=e),t.each(E,function(t,n){var r=i[t];e[t]=function(){return this[n]=x,r&&r.apply(i,arguments)},e[n]=b}),(i.defaultPrevented!==n?i.defaultPrevented:"returnValue"in i?i.returnValue===!1:i.getPreventDefault&&i.getPreventDefault())&&(e.isDefaultPrevented=x)),e}function T(t){var e,i={originalEvent:t};for(e in t)w.test(e)||t[e]===n||(i[e]=t[e]);return j(i,t)}var n,e=1,i=Array.prototype.slice,r=t.isFunction,o=function(t){return"string"==typeof t},s={},a={},u="onfocusin"in window,f={focus:"focusin",blur:"focusout"},c={mouseenter:"mouseover",mouseleave:"mouseout"};a.click=a.mousedown=a.mouseup=a.mousemove="MouseEvents",t.event={add:v,remove:y},t.proxy=function(e,n){if(r(e)){var i=function(){return e.apply(n,arguments)};return i._zid=l(e),i}if(o(n))return t.proxy(e[n],e);throw new TypeError("expected function")},t.fn.bind=function(t,e,n){return this.on(t,e,n)},t.fn.unbind=function(t,e){return this.off(t,e)},t.fn.one=function(t,e,n,i){return this.on(t,e,n,i,1)};var x=function(){return!0},b=function(){return!1},w=/^([A-Z]|returnValue$|layer[XY]$)/,E={preventDefault:"isDefaultPrevented",stopImmediatePropagation:"isImmediatePropagationStopped",stopPropagation:"isPropagationStopped"};t.fn.delegate=function(t,e,n){return this.on(e,t,n)},t.fn.undelegate=function(t,e,n){return this.off(e,t,n)},t.fn.live=function(e,n){return t(document.body).delegate(this.selector,e,n),this},t.fn.die=function(e,n){return t(document.body).undelegate(this.selector,e,n),this},t.fn.on=function(e,s,a,u,f){var c,l,h=this;return e&&!o(e)?(t.each(e,function(t,e){h.on(t,s,a,e,f)}),h):(o(s)||r(u)||u===!1||(u=a,a=s,s=n),(r(a)||a===!1)&&(u=a,a=n),u===!1&&(u=b),h.each(function(n,r){f&&(c=function(t){return y(r,t.type,u),u.apply(this,arguments)}),s&&(l=function(e){var n,o=t(e.target).closest(s,r).get(0);return o&&o!==r?(n=t.extend(T(e),{currentTarget:o,liveFired:r}),(c||u).apply(o,[n].concat(i.call(arguments,1)))):void 0}),v(r,e,u,a,s,l||c)}))},t.fn.off=function(e,i,s){var a=this;return e&&!o(e)?(t.each(e,function(t,e){a.off(t,i,e)}),a):(o(i)||r(s)||s===!1||(s=i,i=n),s===!1&&(s=b),a.each(function(){y(this,e,s,i)}))},t.fn.trigger=function(e,n){return e=o(e)||t.isPlainObject(e)?t.Event(e):j(e),e._args=n,this.each(function(){"dispatchEvent"in this?this.dispatchEvent(e):t(this).triggerHandler(e,n)})},t.fn.triggerHandler=function(e,n){var i,r;return this.each(function(s,a){i=T(o(e)?t.Event(e):e),i._args=n,i.target=a,t.each(h(a,e.type||e),function(t,e){return r=e.proxy(i),i.isImmediatePropagationStopped()?!1:void 0})}),r},"focusin focusout load resize scroll unload click dblclick mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave change select keydown keypress keyup error".split(" ").forEach(function(e){t.fn[e]=function(t){return t?this.bind(e,t):this.trigger(e)}}),["focus","blur"].forEach(function(e){t.fn[e]=function(t){return t?this.bind(e,t):this.each(function(){try{this[e]()}catch(t){}}),this}}),t.Event=function(t,e){o(t)||(e=t,t=e.type);var n=document.createEvent(a[t]||"Events"),i=!0;if(e)for(var r in e)"bubbles"==r?i=!!e[r]:n[r]=e[r];return n.initEvent(t,i,!0),j(n)}}(Zepto),function(t){function l(e,n,i){var r=t.Event(n);return t(e).trigger(r,i),!r.isDefaultPrevented()}function h(t,e,i,r){return t.global?l(e||n,i,r):void 0}function p(e){e.global&&0===t.active++&&h(e,null,"ajaxStart")}function d(e){e.global&&!--t.active&&h(e,null,"ajaxStop")}function m(t,e){var n=e.context;return e.beforeSend.call(n,t,e)===!1||h(e,n,"ajaxBeforeSend",[t,e])===!1?!1:void h(e,n,"ajaxSend",[t,e])}function g(t,e,n,i){var r=n.context,o="success";n.success.call(r,t,o,e),i&&i.resolveWith(r,[t,o,e]),h(n,r,"ajaxSuccess",[e,n,t]),y(o,e,n)}function v(t,e,n,i,r){var o=i.context;i.error.call(o,n,e,t),r&&r.rejectWith(o,[n,e,t]),h(i,o,"ajaxError",[n,i,t||e]),y(e,n,i)}function y(t,e,n){var i=n.context;n.complete.call(i,e,t),h(n,i,"ajaxComplete",[e,n]),d(n)}function x(){}function b(t){return t&&(t=t.split(";",2)[0]),t&&(t==f?"html":t==u?"json":s.test(t)?"script":a.test(t)&&"xml")||"text"}function w(t,e){return""==e?t:(t+"&"+e).replace(/[&?]{1,2}/,"?")}function E(e){e.processData&&e.data&&"string"!=t.type(e.data)&&(e.data=t.param(e.data,e.traditional)),!e.data||e.type&&"GET"!=e.type.toUpperCase()||(e.url=w(e.url,e.data),e.data=void 0)}function j(e,n,i,r){return t.isFunction(n)&&(r=i,i=n,n=void 0),t.isFunction(i)||(r=i,i=void 0),{url:e,data:n,success:i,dataType:r}}function S(e,n,i,r){var o,s=t.isArray(n),a=t.isPlainObject(n);t.each(n,function(n,u){o=t.type(u),r&&(n=i?r:r+"["+(a||"object"==o||"array"==o?n:"")+"]"),!r&&s?e.add(u.name,u.value):"array"==o||!i&&"object"==o?S(e,u,i,n):e.add(n,u)})}var i,r,e=0,n=window.document,o=/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,s=/^(?:text|application)\/javascript/i,a=/^(?:text|application)\/xml/i,u="application/json",f="text/html",c=/^\s*$/;t.active=0,t.ajaxJSONP=function(i,r){if(!("type"in i))return t.ajax(i);var f,h,o=i.jsonpCallback,s=(t.isFunction(o)?o():o)||"jsonp"+ ++e,a=n.createElement("script"),u=window[s],c=function(e){t(a).triggerHandler("error",e||"abort")},l={abort:c};return r&&r.promise(l),t(a).on("load error",function(e,n){clearTimeout(h),t(a).off().remove(),"error"!=e.type&&f?g(f[0],l,i,r):v(null,n||"error",l,i,r),window[s]=u,f&&t.isFunction(u)&&u(f[0]),u=f=void 0}),m(l,i)===!1?(c("abort"),l):(window[s]=function(){f=arguments},a.src=i.url.replace(/\?(.+)=\?/,"?$1="+s),n.head.appendChild(a),i.timeout>0&&(h=setTimeout(function(){c("timeout")},i.timeout)),l)},t.ajaxSettings={type:"GET",beforeSend:x,success:x,error:x,complete:x,context:null,global:!0,xhr:function(){return new window.XMLHttpRequest},accepts:{script:"text/javascript, application/javascript, application/x-javascript",json:u,xml:"application/xml, text/xml",html:f,text:"text/plain"},crossDomain:!1,timeout:0,processData:!0,cache:!0},t.ajax=function(e){var n=t.extend({},e||{}),o=t.Deferred&&t.Deferred();for(i in t.ajaxSettings)void 0===n[i]&&(n[i]=t.ajaxSettings[i]);p(n),n.crossDomain||(n.crossDomain=/^([\w-]+:)?\/\/([^\/]+)/.test(n.url)&&RegExp.$2!=window.location.host),n.url||(n.url=window.location.toString()),E(n),n.cache===!1&&(n.url=w(n.url,"_="+Date.now()));var s=n.dataType,a=/\?.+=\?/.test(n.url);if("jsonp"==s||a)return a||(n.url=w(n.url,n.jsonp?n.jsonp+"=?":n.jsonp===!1?"":"callback=?")),t.ajaxJSONP(n,o);var j,u=n.accepts[s],f={},l=function(t,e){f[t.toLowerCase()]=[t,e]},h=/^([\w-]+:)\/\//.test(n.url)?RegExp.$1:window.location.protocol,d=n.xhr(),y=d.setRequestHeader;if(o&&o.promise(d),n.crossDomain||l("X-Requested-With","XMLHttpRequest"),l("Accept",u||"*/*"),(u=n.mimeType||u)&&(u.indexOf(",")>-1&&(u=u.split(",",2)[0]),d.overrideMimeType&&d.overrideMimeType(u)),(n.contentType||n.contentType!==!1&&n.data&&"GET"!=n.type.toUpperCase())&&l("Content-Type",n.contentType||"application/x-www-form-urlencoded"),n.headers)for(r in n.headers)l(r,n.headers[r]);if(d.setRequestHeader=l,d.onreadystatechange=function(){if(4==d.readyState){d.onreadystatechange=x,clearTimeout(j);var e,i=!1;if(d.status>=200&&d.status<300||304==d.status||0==d.status&&"file:"==h){s=s||b(n.mimeType||d.getResponseHeader("content-type")),e=d.responseText;try{"script"==s?(1,eval)(e):"xml"==s?e=d.responseXML:"json"==s&&(e=c.test(e)?null:t.parseJSON(e))}catch(r){i=r}i?v(i,"parsererror",d,n,o):g(e,d,n,o)}else v(d.statusText||null,d.status?"error":"abort",d,n,o)}},m(d,n)===!1)return d.abort(),v(null,"abort",d,n,o),d;if(n.xhrFields)for(r in n.xhrFields)d[r]=n.xhrFields[r];var T="async"in n?n.async:!0;d.open(n.type,n.url,T,n.username,n.password);for(r in f)y.apply(d,f[r]);return n.timeout>0&&(j=setTimeout(function(){d.onreadystatechange=x,d.abort(),v(null,"timeout",d,n,o)},n.timeout)),d.send(n.data?n.data:null),d},t.get=function(){return t.ajax(j.apply(null,arguments))},t.post=function(){var e=j.apply(null,arguments);return e.type="POST",t.ajax(e)},t.getJSON=function(){var e=j.apply(null,arguments);return e.dataType="json",t.ajax(e)},t.fn.load=function(e,n,i){if(!this.length)return this;var a,r=this,s=e.split(/\s/),u=j(e,n,i),f=u.success;return s.length>1&&(u.url=s[0],a=s[1]),u.success=function(e){r.html(a?t("<div>").html(e.replace(o,"")).find(a):e),f&&f.apply(r,arguments)},t.ajax(u),this};var T=encodeURIComponent;t.param=function(t,e){var n=[];return n.add=function(t,e){this.push(T(t)+"="+T(e))},S(n,t,e),n.join("&").replace(/%20/g,"+")}}(Zepto),function(t){t.fn.serializeArray=function(){var n,e=[];return t([].slice.call(this.get(0).elements)).each(function(){n=t(this);var i=n.attr("type");"fieldset"!=this.nodeName.toLowerCase()&&!this.disabled&&"submit"!=i&&"reset"!=i&&"button"!=i&&("radio"!=i&&"checkbox"!=i||this.checked)&&e.push({name:n.attr("name"),value:n.val()})}),e},t.fn.serialize=function(){var t=[];return this.serializeArray().forEach(function(e){t.push(encodeURIComponent(e.name)+"="+encodeURIComponent(e.value))}),t.join("&")},t.fn.submit=function(e){if(e)this.bind("submit",e);else if(this.length){var n=t.Event("submit");this.eq(0).trigger(n),n.isDefaultPrevented()||this.get(0).submit()}return this}}(Zepto),function(t){"__proto__"in{}||t.extend(t.zepto,{Z:function(e,n){return e=e||[],t.extend(e,t.fn),e.selector=n||"",e.__Z=!0,e},isZ:function(e){return"array"===t.type(e)&&"__Z"in e}});try{getComputedStyle(void 0)}catch(e){var n=getComputedStyle;window.getComputedStyle=function(t){try{return n(t)}catch(e){return null}}}}(Zepto);
//     Zepto.js
//     (c) 2010-2014 Thomas Fuchs
//     Zepto.js may be freely distributed under the MIT license.

;(function($, undefined){
  var prefix = '', eventPrefix, endEventName, endAnimationName,
    vendors = { Webkit: 'webkit', Moz: '', O: 'o' },
    document = window.document, testEl = document.createElement('div'),
    supportedTransforms = /^((translate|rotate|scale)(X|Y|Z|3d)?|matrix(3d)?|perspective|skew(X|Y)?)$/i,
    transform,
    transitionProperty, transitionDuration, transitionTiming, transitionDelay,
    animationName, animationDuration, animationTiming, animationDelay,
    cssReset = {}

  function dasherize(str) { return str.replace(/([a-z])([A-Z])/, '$1-$2').toLowerCase() }
  function normalizeEvent(name) { return eventPrefix ? eventPrefix + name : name.toLowerCase() }

  $.each(vendors, function(vendor, event){
    if (testEl.style[vendor + 'TransitionProperty'] !== undefined) {
      prefix = '-' + vendor.toLowerCase() + '-'
      eventPrefix = event
      return false
    }
  })

  transform = prefix + 'transform'
  cssReset[transitionProperty = prefix + 'transition-property'] =
  cssReset[transitionDuration = prefix + 'transition-duration'] =
  cssReset[transitionDelay    = prefix + 'transition-delay'] =
  cssReset[transitionTiming   = prefix + 'transition-timing-function'] =
  cssReset[animationName      = prefix + 'animation-name'] =
  cssReset[animationDuration  = prefix + 'animation-duration'] =
  cssReset[animationDelay     = prefix + 'animation-delay'] =
  cssReset[animationTiming    = prefix + 'animation-timing-function'] = ''

  $.fx = {
    off: (eventPrefix === undefined && testEl.style.transitionProperty === undefined),
    speeds: { _default: 400, fast: 200, slow: 600 },
    cssPrefix: prefix,
    transitionEnd: normalizeEvent('TransitionEnd'),
    animationEnd: normalizeEvent('AnimationEnd')
  }

  $.fn.animate = function(properties, duration, ease, callback, delay){
    if ($.isFunction(duration))
      callback = duration, ease = undefined, duration = undefined
    if ($.isFunction(ease))
      callback = ease, ease = undefined
    if ($.isPlainObject(duration))
      ease = duration.easing, callback = duration.complete, delay = duration.delay, duration = duration.duration
    if (duration) duration = (typeof duration == 'number' ? duration :
                    ($.fx.speeds[duration] || $.fx.speeds._default)) / 1000
    if (delay) delay = parseFloat(delay) / 1000
    return this.anim(properties, duration, ease, callback, delay)
  }

  $.fn.anim = function(properties, duration, ease, callback, delay){
    var key, cssValues = {}, cssProperties, transforms = '',
        that = this, wrappedCallback, endEvent = $.fx.transitionEnd,
        fired = false

    if (duration === undefined) duration = $.fx.speeds._default / 1000
    if (delay === undefined) delay = 0
    if ($.fx.off) duration = 0

    if (typeof properties == 'string') {
      // keyframe animation
      cssValues[animationName] = properties
      cssValues[animationDuration] = duration + 's'
      cssValues[animationDelay] = delay + 's'
      cssValues[animationTiming] = (ease || 'linear')
      endEvent = $.fx.animationEnd
    } else {
      cssProperties = []
      // CSS transitions
      for (key in properties)
        if (supportedTransforms.test(key)) transforms += key + '(' + properties[key] + ') '
        else cssValues[key] = properties[key], cssProperties.push(dasherize(key))

      if (transforms) cssValues[transform] = transforms, cssProperties.push(transform)
      if (duration > 0 && typeof properties === 'object') {
        cssValues[transitionProperty] = cssProperties.join(', ')
        cssValues[transitionDuration] = duration + 's'
        cssValues[transitionDelay] = delay + 's'
        cssValues[transitionTiming] = (ease || 'linear')
      }
    }

    wrappedCallback = function(event){
      if (typeof event !== 'undefined') {
        if (event.target !== event.currentTarget) return // makes sure the event didn't bubble from "below"
        $(event.target).unbind(endEvent, wrappedCallback)
      } else
        $(this).unbind(endEvent, wrappedCallback) // triggered by setTimeout

      fired = true
      $(this).css(cssReset)
      callback && callback.call(this)
    }
    if (duration > 0){
      this.bind(endEvent, wrappedCallback)
      // transitionEnd is not always firing on older Android phones
      // so make sure it gets fired
      setTimeout(function(){
        if (fired) return
        wrappedCallback.call(that)
      }, (duration * 1000) + 25)
    }

    // trigger page reflow so new elements can animate
    this.size() && this.get(0).clientLeft

    this.css(cssValues)

    if (duration <= 0) setTimeout(function() {
      that.each(function(){ wrappedCallback.call(this) })
    }, 0)

    return this
  }

  testEl = null
})(Zepto);

module.exports = Zepto;

},{}],16:[function(require,module,exports){
'use strict';

module.exports = function($, globals) {
  return function() {
    if ($.z("pre.ascii-frames").length == 0 || typeof slides == "undefined") {
      return;
    }
    var condition = 'raining';
    window.slide_count = 0;
    setInterval(function() {
      var frame = slides[condition]['frames'][window.slide_count].join("\n");

      window.slide_count =
        (window.slide_count == slides[condition]['frames'].length - 1) ?
          0 : window.slide_count + 1;

      $.z("pre.ascii-frames").html(frame);

    }, slides[condition]['interval']);
  };
};

},{}],17:[function(require,module,exports){
'use strict';

module.exports = function($, globals, util, router) {
  var toggling_consulting = false;

  function install_consulting_routing() {
    // Only show clients section if consulting mode enabled
    [
      { url: "/consulting", consulting_mode_enabled: true },
      { url: "/noncommercial", consulting_mode_enabled: false  }
    ].forEach(function(state) {
      router.get(state.url, function(request) {
        toggling_consulting = true;
        $.simpleStorage.flush();
        $.simpleStorage.set('consulting-mode', state.consulting_mode_enabled);
        util.load_href('/clients');
      });
    });

    // Only allow showing clients if on
    router.get("/clients/:subsection?", function(request) {
      if (!$.simpleStorage.get('consulting-mode')) {
        util.load_href('/');
      }
    });
  }

  function install_clients_navigation_link() {
    // only installs if in consulting mode
    var clients_section_active = window.location.pathname.match(/^\/clients/);
    var is_homepage = $.z("html head title").text().match(/^Userbound/);

    // makes it active, if on /clients*
    var clients_link = $.z("<a href='/clients' title='Clients'></a>")
      .addClass(clients_section_active ? "active" : "")
      .attr("title", is_homepage ? "" : "Clients")
      .append([
        "<span class='symbol'>",
        "<svg class='icon-screen'>",
        "<use xlink:href='/assets/images/icons.svg#icon-screen'></use>",
        "</svg>",
        "</span>\n",
        "<span class='title'>Clients</span>"
      ].join(""));

    $.z(clients_link).insertBefore($.z("nav a")[1]);
  }

  function install_consulting_toggle() {
    install_consulting_routing();
    if ($.simpleStorage.get('consulting-mode')) { 
      install_clients_navigation_link(); 
    }
    if (toggling_consulting) { 
      return 'toggling consulting';
    }
  }

  return {
    install_consulting_toggle: install_consulting_toggle
  };
};

},{}],18:[function(require,module,exports){
'use strict';

module.exports = function($, globals, util, router) {
  function subsection_button_click(e) {
    var subsection = e.target.innerHTML.toLowerCase();

    // Models follows a different schema since its only subpage with stubs
    router.navigate(
      window.location.href.match(/\/works\/(?!cad|music).+/) ?
        "/works/" + util.trim($.z("h1").text()) + "/" + subsection.replace(" ", "-") :
        "/" + $.z("h1").text().toLowerCase() + "/" + subsection.replace(" ", "-")
      );
  }

  function install_dom_event_bindings() {
    // Setup click callbacks for links and subsection clicking
    $.z(".filter-by button").on("click", subsection_button_click);
    $.z("img[data-category-model]").on("click", function() {$.z($.z(".filter-by button")[1]).click()});
  }

  return {
    install_dom_event_bindings: install_dom_event_bindings
  };
}

},{}],19:[function(require,module,exports){
'use strict';

module.exports = {
  tracks: {
    '8/24/15': 'db110.WAV',
    '8/21/15': 'db107.WAV',
    '7/27/15': 'db089.WAV',
    '7/21/15': 'db083.WAV',
    '7/17/15': 'db078.WAV',
    '7/08/15': 'db069.WAV',
    '7/03/15': 'db064.WAV',
    '6/17/15': 'db048.WAV',
    '6/14/15': 'db045.WAV'
  },
  sync_callback: function() {}
};

},{}],20:[function(require,module,exports){
'use strict';

module.exports = function($, globals, util, router) {

  ['clients', 'about', 'interfaces', 'works'].forEach(function(section) { 

    if ($.z(".filter-by button").length > 0) {
      router.get('/' + section, function(request) {
        util.activate_subsection(
          $.z($.z(".filter-by button")[0]).text().toLowerCase().replace(" ", "-")
        );
      });
    }

    router.get('/' + section + '/:subsection', function(request) {
      var subsection = request.params.subsection;
      util.activate_subsection(subsection);
    });

    // nested subsection
    router.get('/' + section + '/:page/:nested', function(request) {
      util.activate_subsection(request.params.nested);
    });
  });


};

},{}],21:[function(require,module,exports){
'use strict';

module.exports = function($, globals) {

  function strip_leading_and_trailing_slashes(str) {
    return str.replace(/^\/|\/$/g, '');
  }

  function trim(str) {
    return str.replace(/^\s+|\s+$/g,'');
  }

  function current_active_section() {
    return $.z(".filter-by button.active").length > 0 ?
      $.z(".filter-by button.active").text().toLowerCase().replace(" ", "-") :
      false;
  }

  function load_href(href) {
    window.location = href;
  }

  function fade_up_out(new_href) {
    var transition_duration_ms = 1000;
    $.z("nav").addClass('fade-out');
    $.z("main").addClass('fade-up');

    setTimeout(function() {
      if (new_href) { load_href(new_href); }
    }, transition_duration_ms);
  };

  function redirect_homepage_to(path) {
    var is_homepage = $.z("html head title").text().match(/^Userbound/);
    if (is_homepage) {
      //load_href(path);
      return;
    }
  }


  function activate_subsection(subsection) {
    if (
      // Already activated on that button
      current_active_section() === subsection ||

      // Pageload for secondary page
      trim($.z("h1").text()) === subsection
    ) { return; }

    var active_subsection_el  = $.z(".filter-el.visible");
    var active_subsection_btn = $.z(".filter-by button");
    var out_els = [], in_els = [];


    active_subsection_btn.removeClass("active");
    $.z(".filter-by button").each(function(i, el) {
      if ($.z(el).text().toLowerCase().replace(" ", "-") == subsection) {
        $.z(el).addClass("active");
      }
    });

    active_subsection_el.animate({ opacity: 0 }, function() {
      var new_subsection_el =
        $.z(".filter-el[data-category-" + subsection.replace(" ", "-") + "]");
      active_subsection_el.removeClass("visible");
      new_subsection_el.css("opacity", 0).addClass("visible");
      new_subsection_el.animate({ opacity: 1 }, function() {});
    });

    globals.sync_callback();
  }

  return {
    strip_leading_and_trailing_slashes: strip_leading_and_trailing_slashes,
    trim: trim,
    current_active_section: current_active_section,
    load_href: load_href,
    activate_subsection: activate_subsection,
    fade_up_out: fade_up_out,
    redirect_homepage_to: redirect_homepage_to
  };

};

},{}]},{},[3])


//# sourceMappingURL=all.js.map