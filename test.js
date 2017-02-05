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
          console.log(this.ctx);
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
})