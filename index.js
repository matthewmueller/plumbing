'use strict'

/**
 * Module Dependencies
 */

let flatten = require('lodash.flatten')
let assign = require('deep-extend')
let sliced = require('sliced')
let is_array = Array.isArray
let keys = Object.keys
function noop () {}

/**
 * Export `Plumbing`
 */

module.exports = Plumbing

/**
 * Plumbing
 */

function Plumbing () {
  let hooks = { transforms: [], augments: [], assigns: [] }
  let state = { actions: {}, hooks: hooks }
  let args = flatten(sliced(arguments))
  let actions = state.actions
  let middlewares = []

  args.map(function (arg) {
    if (arg.__plumbing__) return state = assign(state, arg.__plumbing__)
    if (typeof arg === 'object') return state = assign(state, { actions: arg })
    if (typeof arg === 'function') return middlewares.push(arg)
  })

  // compose our middleware together
  middlewares.map((middleware) => middleware({
    augment(fn) { state.hooks.augments.push(fn) },
    assign(fn) { state.hooks.assigns.push(fn) },
    transform(fn) { state.hooks.transforms.push(fn) }
  }))

  function Class (ctx) {
    if (!(this instanceof Class)) return new Class(ctx)
    ctx = state.hooks.assigns.reduce((ctx, fn) => fn(ctx) || ctx, ctx)
    assign(this, ctx)
  }

  // augment actions
  let augments = state.hooks.augments.reduce((augments, fn) => fn(augments) || augments, {})

  keys(assign(actions, augments)).forEach(function (action) {
    if (typeof actions[action] === 'function') {
      Class.prototype[action] = function () {
        let trs = state.hooks.transforms
        let ctx = this

        if (this.__root__) {
          ctx = this.__root__.ctx
          trs = this.__root__.trs
        }

        let args = sliced(arguments)
        let fn = actions[action]

        if (!augments[action]) {
          fn = trs.reduce(function (fn, tr) {
            return tr(fn, action)
          }, fn)
        }

        // transform pipeline
        return fn.apply(ctx, args)
      }
    } else {
      var ChildClass = Plumbing(actions[action])
      Class.prototype.__defineGetter__(action, function() {
        var child = ChildClass()
        child.__root__ = this.__root__ || { ctx: this, trs: state.hooks.transforms }
        return child
      })
    }
  })

  // support for composition
  Class.__plumbing__ = state
  return Class
}
