'use strict'

/**
 * Module Dependencies
 */

var assign = require('object-assign')

/**
 * Export `Plumbing`
 */

module.exports = Plumbing

/**
 * Plumbing
 */

function Plumbing (actions, root) {
  root = root || {}

  function Class (ctx) {
    if (!(this instanceof Class)) return new Class(ctx)
    assign(this, ctx)
  }

  Object.keys(actions).forEach(function(action) {
    if (typeof actions[action] === 'function') {
      Class.prototype[action] = function () {
        return actions[action].apply(this._root || this, arguments)
      }
    } else if (typeof actions[action] === 'object') {
      var ChildClass = Plumbing(actions[action])
      Class.prototype.__defineGetter__(action, function() {
        var child = ChildClass({ _root: this._root || this })
        return child
      })
    }
  })

  return Class
}