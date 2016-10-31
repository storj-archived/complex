'use strict';

var EventEmitter = require('events').EventEmitter;
var restify = require('restify');
var expect = require('chai').expect;
var rabbitmq = require('rabbit.js');
var sinon = require('sinon');

var complex = require('..');
var Landlord = require('../lib/landlord');

describe('Landlord', function() {
  var sandbox = sinon.sandbox.create();
  afterEach(function() {
    sandbox.restore();
  });

  describe('@construction', function() {
    var opts = {hello: 'world'};
    function checkLandlord(landlord) {
      expect(landlord);
      expect(landlord._opts.hello).to.equal('world');
      expect(landlord.server);
      expect(landlord.server).to.be.instanceOf(require('restify/lib/server'));
      expect(landlord._logger).to.be.instanceOf(require('kad-logger-json'));
      expect(landlord._pendingResponses).to.deep.equal({});
      expect(Landlord.prototype._bindServerRoutes.callCount).to.equal(1);
    }
    it('will create without new', function() {
      sandbox.stub(Landlord.prototype, '_bindServerRoutes');
      var landlord = complex.createLandlord(opts);
      checkLandlord(landlord);
    });
    it('will create with new', function() {
      sandbox.stub(Landlord.prototype, '_bindServerRoutes');
      var landlord = new complex.createLandlord(opts);
      checkLandlord(landlord);
    });
    it('will push on logger data events', function(done) {
      var landlord = complex.createLandlord({});
      landlord.once('data', function(data) {
        expect(data.toString()).to.equal('hello');
        done();
      });
      landlord._logger.emit('data', 'hello');
    });
  });

  describe('#_bindServerRoutes', function() {
    it('will use auth and body parser', function() {
      var landlord = complex.createLandlord({});
      landlord.server = {
        use: sandbox.stub(),
        post: sandbox.stub()
      };
      sandbox.stub(restify, 'authorizationParser').returns('a');
      sandbox.stub(restify, 'bodyParser').returns('b');
      landlord._bindServerRoutes();
      expect(landlord.server.use.callCount).to.equal(2);
      expect(landlord.server.use.args[0][0]).to.equal('a');
      expect(landlord.server.use.args[1][0]).to.equal('b');
      expect(landlord.server.post.callCount).to.equal(1);
      expect(landlord.server.post.args[0][0]).to.equal('/');
      expect(landlord.server.post.args[0][1]).to.be.a('function');
      // TODO check that function is json request handler
    });
  });

  describe('#start', function() {
    it('will start server and rabbit context', function(done) {
      var landlord = complex.createLandlord({
        serverPort: 3425
      });
      landlord.server = {
        listen: sandbox.stub()
      };
      var rabbit = new EventEmitter();
      sandbox.stub(rabbitmq, 'createContext').returns(rabbit);
      sandbox.stub(landlord, '_initMessageBus', function() {
        this.emit('ready');
      });
      landlord.start(function(err) {
        expect(landlord.server.listen.callCount).to.equal(1);
        expect(landlord.server.listen.args[0][0]).to.equal(3425);
        expect(err).to.equal(undefined);
        done();
      });
      rabbit.emit('ready');
    });
    it('will handle error', function(done) {
      var landlord = complex.createLandlord({});
      landlord.server = {
        listen: sandbox.stub()
      };
      var rabbit = new EventEmitter();
      sandbox.stub(rabbitmq, 'createContext').returns(rabbit);
      sandbox.stub(landlord, '_initMessageBus', function() {
        this.emit('error', new Error('test'));
      });
      landlord.start(function(err) {
        expect(err).to.be.instanceOf(Error);
        done();
      });
      rabbit.emit('ready');
    });
  });

  describe('#_initMessageBus', function() {
    it('will init amqp sockets', function(done) {
      var landlord = complex.createLandlord({});
      var subscriber = new EventEmitter();
      subscriber.connect = sandbox.stub();
      landlord._amqpContext = {
        socket: function(type) {
          switch(type) {
            case 'PUBLISH':
              return {
                connect: sandbox.stub()
              };
            case 'SUBSCRIBE':
              return subscriber;
            case 'PUSH':
              return {
                connect: sandbox.stub()
              };
          }
        }
      };
      landlord._handleWorkResult = function(data) {
        expect(data).to.equal('z');
        done();
      };
      landlord.on('ready', function() {
        landlord.subscriber.emit('data', 'z');
      });
      landlord._initMessageBus();
      expect(landlord.publisher.connect.callCount).to.equal(1);
      expect(landlord.publisher.connect.args[0][0]).to.equal('pool');
      expect(landlord.subscriber.connect.callCount).to.equal(1);
      expect(landlord.subscriber.connect.args[0][0]).to.equal('work.close');
      expect(landlord.pusher.connect.callCount).to.equal(1);
      expect(landlord.pusher.connect.args[0][0]).to.equal('work.open');
    });
  });

  describe('#_handleJsonRpcRequest', function() {
  });

  describe('#_isValidJsonRpcRequest', function() {
    var landlord = complex.createLandlord({});
    it('id should be a string', function() {
      var req = { id: 1234 };
      expect(landlord._isValidJsonRpcRequest(req)).to.equal(false);
    });
    it('params should be an array', function() {
      var req = { id: 'someid', params: {} };
      expect(landlord._isValidJsonRpcRequest(req)).to.equal(false);
    });
    it('method shoud be a string', function() {
      var req = { id: 'someid', params: [], method: 847483 };
      expect(landlord._isValidJsonRpcRequest(req)).to.equal(false);
    });
    it('will return true for valid req', function() {
      var req = { id: 'someid', params: [], method: 'getRetrievalPointer' };
      expect(landlord._isValidJsonRpcRequest(req)).to.equal(true);
    });
  });

  describe('#_handleWorkResult', function() {
    it('', function() {
    });
    it('', function() {
    });
    it('', function() {
    });
  });

  describe('#_objectToArray', function() {
    it('will convert an object into an array', function() {
      var landlord = complex.createLandlord({});
      var result = landlord._objectToArray({0: 'z', 1: 'y'});
      expect(result).to.deep.equal(['z', 'y']);
    });
  });

});


