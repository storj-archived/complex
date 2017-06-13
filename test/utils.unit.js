'use strict'

var EventEmitter = require('events').EventEmitter;
var utils = require('../lib/utils');
var rabbitmq = require('rabbit.js');
var expect = require('chai').expect;
var sinon = require('sinon');

describe('utils', function() {
  var sandbox = sinon.sandbox.create();
  afterEach(function() {
    sandbox.restore();
  });

  describe('#setupRabbitmq', function() {
    var rabbit;
    var landlord;

    beforeEach(function() {
      rabbit = new EventEmitter();
      sandbox.stub(rabbitmq, 'createContext').returns(rabbit);
      landlord = {
        _initMessageBus: sinon.stub(),
        _logger: {
          warn: sinon.stub()
        },
        _opts: {
          amqpUrl: 'testamqpurl',
          amqpOpts: {}
        }
      };
    });

    it('should log an error if not bound to a valid object', function() {
      expect(utils.setupRabbitmq).to.throw('setupRabbitmq must be bound to a valid object');
    });

    it('should call _initMessageBus when rabbitmq emits "ready"', function() {
      utils.setupRabbitmq.bind(landlord);
      rabbit.emit('ready');

      expect(rabbitmq.createContext.calledWithmatch(landlord._opts.amqpUrl, landlord._opts.amqpOpts)).to.equal(true);
      expect(landlord._initMessageBus.callCount).to.equal(1);
    });

    it('should log an error if rabbitmq emits one', function() {
      var testError = new Error('this is an error');

      utils.setupRabbitmq.bind(landlord);
      rabbit.emit('error', testError);

      expect(landlord._initMessageBus.callCount).to.equal(0);
      expect(landlord._logger.warn.calledWithMatch('rabbitmq error: ' + testError.message).to.equal(true);
    });

    it('should attempt to reconnect on ENOTFOUND, ECONNREFUSED, and ECONNRESET', function() {
      const clock = sandbox.useFakeTimers();

      function testReconnect(errorCode) {
        var testError = new Error(errorCode);
        testError.code = errorCode;

        utils.setupRabbitmq.bind(landlord);
        rabbit.emit('error', testError);

        expect(landlord._logger.warn.calledWithMatch('rabbitmq error: ' + testError.message).to.equal(true);

        sandbox.stub(landlord, '_setupRabbitmq');
        clock.tick(5000);
        expect(landlord._logger.warn.calledWithMatch('reconnectin to rabbitmq')).to.equal(true);
        expect(landlord._setupRabbitmq.callCount).to.equal(1);
      }

      testReconnect('ENOTFOUND');
      testReconnect('ECONNREFUSED');
      testReconnect('ECONNRESET');
    });
  });
});
