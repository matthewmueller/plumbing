'use strict'

/**
 * Module Dependencies
 */

let is_generator = require('is-generator-fn')
let assign = require('object-assign')
let unyield = require('unyield')
let wrapped = require('wrapped')
let assert = require('assert')
let sliced = require('sliced')
let Plumbing = require('./')

/**
 * Tests
 */

describe('Plumbing', function() {
  it('should support a shared context', function() {
    let Class = Plumbing({
      a: function (a) {
        assert.equal(a, 'a')
        assert.equal(this.ctx, 'ctx')
        this.ctx = 'a'
        return 'a'
      },
      b: {
        o: function (o) {
          assert.equal(o, 'o')
          assert.equal(this.ctx, 'a')
          this.ctx = 'bo'
          return 'o'
        },
        t: function (t) {
          assert.equal(t, 't')
          assert.equal(this.ctx, 'bo')
          this.ctx = 'bt'
          return 't'
        },
        c: {
          f: function (f) {
            assert.equal(f, 'f')
            assert.equal(this.ctx, 'bt')
            this.ctx = 'bcf'
            return 'f'
          }
        }
      }
    })

    var obj = Class({ ctx: 'ctx' })
    assert.equal(obj.a('a'), 'a')
    assert.equal(obj.b.o('o'), 'o')
    assert.equal(obj.b.t('t'), 't')
    assert.equal(obj.b.c.f('f'), 'f')
    assert.equal(obj.ctx, 'bcf')
  })

  it('should behave like normal functions', function * () {
    let Class = Plumbing({
      a: function (a) {
        assert.equal(a, 'a')
        assert.equal(this.ctx, 'ctx')
        this.ctx = 'a'
        return 'a'
      },
      b: {
        o: function * (o) {
          assert.equal(o, 'o')
          assert.equal(this.ctx, 'a')
          this.ctx = 'bo'
          return 'o'
        }
      }
    })
    var obj = Class({ ctx: 'ctx' })
    assert.equal(obj.a('a'), 'a')
    assert.equal(yield obj.b.o('o'), 'o')
    assert.equal(obj.ctx, 'bo')
  })

  it('should support (powerful) middleware', function * () {
    var Class = Plumbing({
      a: function (a, fn) {
        assert.equal(a, 'a')
        assert.equal(this.ctx, 'ctx')
        this.ctx = 'a'
        fn(null, 'a')
      },
      b: {
        o: function (o, fn) {
          assert.equal(o, 'o')
          assert.equal(this.ctx, 'bcf')
          this.ctx = 'bo'
          fn(null, 'o')
        },
        t: function (t, fn) {
          assert.equal(t, 't')
          assert.equal(this.ctx, 'bo')
          this.ctx = 'bt'
          fn(null, 't')
        },
        c: {
          f: function (f, fn) {
            assert.equal(f, 'f')
            assert.equal(this.ctx, 'a')
            this.ctx = 'bcf'
            fn(null, 'f')
          }
        }
      }
    }, queue)

    function queue (hook) {
      hook.augment(function (actions) {
        actions.then = function then (success, failure) {
          let queue = this.queue
          let p = new Promise(function (success, failure) {
            // execute the queue serially
            function next(err, value) {
              if (err) return done(err)
              let fn = queue.shift()
              if (!fn) return done(null, value)
              fn(next)
            }

            function done(err, value) {
              return err ? failure(err) : success(value)
            }

            next()
          })

          return p.then(success, failure)
        }
      })

      hook.assign(function (ctx) {
        ctx.queue = []
        return ctx
      })

      hook.transform(function (fn, name) {
        if (name === 'then') return fn
        return function () {
          let args = sliced(arguments)
          let ctx = this

          this.queue.push(function (done) {
            return fn.apply(ctx, args.concat(done))
          })

          return ctx
        }
      })
    }

    var instance = Class({
      ctx: 'ctx'
    })

    var val = yield instance
      .a('a')
      .b.c.f('f')
      .b.o('o')

    assert.deepEqual(instance.queue, [])
    assert.deepEqual(instance.ctx, 'bo')
    assert.equal(val, 'o')
  })

  it('should support multiple middleware', function() {
    let outs = []
    let ins = []

    let Class = Plumbing({
      a(a) {
        assert.equal(a, 'a')
        return 'aa'
      }
    }, Proxy(proxy), Logger('module', ins, outs))

    var instance = Class()
    var ret = instance.a('a')
    assert.equal(ret, 'aaaa')
    assert.deepEqual(ins, ['→ module: a(a)'])
    assert.deepEqual(outs, ['← module: a(a) = aaaa'])
  })

  it('plumbing instances should be composable', function() {
    let outs = []
    let ins = []

    let One = Plumbing({
      a(a) {
        assert.equal(a, 'a')
        return 'aa'
      }
    }, Proxy(proxy))

    function b (b) {
      assert.equal(b, 'b')
      return 'bb'
    }

    let Two = Plumbing(One, { b: b }, Logger('module', ins, outs))

    var instance = Two()
    var ret = instance.a('a')
    assert.equal(ret, 'aaaa')
    assert.deepEqual(ins, ['→ module: a(a)'])
    assert.deepEqual(outs, ['← module: a(a) = aaaa'])
    var ret = instance.b('b')
    assert.equal(ret, 'bbbb')
    assert.deepEqual(ins, ['→ module: a(a)', '→ module: b(b)'])
    assert.deepEqual(outs, ['← module: a(a) = aaaa', '← module: b(b) = bbbb'])
  })

  it('should not transform augmented functions', function() {
    let API = Plumbing({
      a() {
        return 'a'
      }
    }, mw)

    function mw (hook) {
      hook.augment(function(actions) {
        actions.b = function () {
          return 'b'
        }
      })

      hook.transform(function (fn, name) {
        return function () {
          let ret = fn.apply(this, arguments)
          return 't' + ret
        }
      })
    }

    let api = API()
    assert.equal('ta', api.a())
    assert.equal('b', api.b())
  })

  it('should support wrapping middleware', function * () {
    let API = Plumbing({
      a,
      b
    }, function wrap (hook) {
      hook.transform(function (fn, name) {
        if (!is_generator(fn)) return fn
        return unyield(fn)
      })
    })

    function a (a) {
      assert.equal(a, 'a')
      assert.equal(this.ctx, 'ctx')
      return 'a'
    }

    function * b (b) {
      assert.equal(b, 'b')
      assert.equal(this.ctx, 'ctx')
      return 'b'
    }

    let api = API({ ctx: 'ctx' })
    assert.equal('a', api.a('a'))
    assert.equal('b', yield api.b('b'))
  })
})

function Proxy (proxy) {
  return function (hook) {
    hook.transform(proxy)
  }
}

function Logger (ns, ins, outs) {
  return function (hook) {
    hook.transform(function (action, name) {
      return function (args) {
        ins.push(`→ ${ns}: ${name}(${args})`)
        let ret = action.apply(this, arguments)
        outs.push(`← ${ns}: ${name}(${args}) = ${ret}`)
        return ret
      }
    })
  }
}

function proxy (fn, name) {
  return function () {
    let ret = fn.apply(this, arguments)
    return ret + ret
  }
}
