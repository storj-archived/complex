'use strict';

var EventEmitter = require('events').EventEmitter;
var restify = require('restify');
var expect = require('chai').expect;
var rabbitmq = require('rabbit.js');
var sinon = require('sinon');
var fs = require('fs');

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

    it('will set the default request timeout', function() {
      var landlord = complex.createLandlord({});
      expect(landlord._requestTimeout).to.equal(90000);
    });

    it('will convert config instance to object', function() {
      var config = {
        type: 'Landlord',
        opts: {
          logLevel: 3000,
          amqpUrl: 'amqp://localhost',
          amqpOpts: {},
          serverPort: 8080,
          serverOpts: {
            certficate: null,
            key: null,
            authorization: {
              username: 'user',
              password: 'pass'
            }
          }
        }
      };
      sandbox.stub(fs, 'readFileSync');
      fs.readFileSync.onFirstCall().returns(JSON.stringify(config));
      var conf = complex.createConfig('/tmp/someconfig.json');
      var landlord = complex.createLandlord(conf);
      expect(landlord._opts.logLevel).to.equal(3000);
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

  describe('#_checkJsonRpcRequest', function() {
    var landlord = complex.createLandlord({});
    landlord._opts = {
      serverOpts: {
        authorization: {
          username: 'user',
          password: 'pass'
        }
      }
    };

    it('will return unauthorized error', function() {
      var req = {
        authorization: {
          basic: {
            username: 'user',
            password: 'not the correct pass'
          }
        }
      };
      var error = landlord._checkJsonRpcRequest(req);
      expect(error).to.be.instanceOf(Error);
      expect(error.message).to.equal('Not authorized');
    });

    it('will return bad request error', function() {
      var req = {
        authorization: {
          basic: {
            username: 'user',
            password: 'pass'
          }
        },
        body: {
          id: 12345
        }
      };
      var error = landlord._checkJsonRpcRequest(req);
      expect(error).to.be.instanceOf(Error);
      expect(error.message).to.equal('Bad request');
    });

    it('will return undefined without any errors', function() {
      var req = {
        authorization: {
          basic: {
            username: 'user',
            password: 'pass'
          }
        },
        body: {
          id: 'someid',
          params: [],
          method: 'getRetrievalPointer'
        }
      };
      var error = landlord._checkJsonRpcRequest(req);
      expect(error).to.equal(undefined);
    });
  });

  describe('#_setJsonRpcRequestTimeout', function() {
    it('will log method, id, data_hash and node_id', function(done) {
      var landlord = complex.createLandlord({ requestTimeout: 1 });
      sandbox.stub();
      var send = sinon.stub();
      landlord._pendingResponses.someid = {
        send: send
      };
      sandbox.stub(landlord._logger, 'warn');
      var req = {
        body: {
          id: 'someid',
          params: [
            {
              nodeID: 'nodeid'
            },
            {
              data_hash: 'data_hash'
            }
          ],
          method: 'getRetrievalPointer'
        }
      };
      landlord._setJsonRpcRequestTimeout(req);
      setTimeout(function() {
        expect(landlord._logger.warn.callCount).to.equal(1);
        expect(landlord._logger.warn.args[0][0])
          .to.equal('job timed out, method: %s, id: %s, ' +
                    'data_hash: %s, node_id: %s');
        expect(landlord._logger.warn.args[0][1])
          .to.equal('getRetrievalPointer');
        expect(landlord._logger.warn.args[0][2])
          .to.equal('someid');
        done();
      }, 2);
    });

    it('will log method, id and data_hash on timeout', function(done) {
      var landlord = complex.createLandlord({ requestTimeout: 1 });
      sandbox.stub();
      var send = sinon.stub();
      landlord._pendingResponses.someid = {
        send: send
      };
      sandbox.stub(landlord._logger, 'warn');
      var req = {
        body: {
          id: 'someid',
          params: [
            {
              data_hash: 'data_hash'
            }
          ],
          method: 'getStorageOffer'
        }
      };
      landlord._setJsonRpcRequestTimeout(req);
      setTimeout(function() {
        expect(landlord._logger.warn.callCount).to.equal(1);
        expect(landlord._logger.warn.args[0][0])
          .to.equal('job timed out, method: %s, id: %s, ' +
                    'data_hash: %s, node_id: %s');
        expect(landlord._logger.warn.args[0][1])
          .to.equal('getStorageOffer');
        expect(landlord._logger.warn.args[0][2])
          .to.equal('someid');
        done();
      }, 2);
    });
    
    it('will send error after timeout ', function(done) {
      var landlord = complex.createLandlord({ requestTimeout: 1 });
      var send = sandbox.stub();
      landlord._pendingResponses.someid = {
        send: send
      };
      var req = {
        body: {
          id: 'someid'
        }
      };
      landlord._setJsonRpcRequestTimeout(req);
      setTimeout(function() {
        expect(send.callCount).to.equal(1);
        expect(landlord._pendingResponses.someid).to.equal(undefined);
        done();
      }, 2);
    });
    it('will return if there is a missing pending response', function(done) {
      var landlord = complex.createLandlord({ requestTimeout: 5 });
      var send = sandbox.stub();
      var req = {
        body: {
          id: 'someid'
        }
      };
      landlord._setJsonRpcRequestTimeout(req);
      setTimeout(function() {
        expect(send.callCount).to.equal(0);
        expect(landlord._pendingResponses.someid).to.equal(undefined);
        done();
      }, 2);
    });
  });

  describe('#_handleJsonRpcRequest', function() {
    it('will send error with invalid json or auth', function() {
      var landlord = complex.createLandlord({ requestTimout: 1 });
      var req = {
        body: {
          id: 'someid'
        }
      };
      var res = {
        send: sinon.stub()
      };
      landlord.pusher = {
        write: sinon.stub()
      };
      landlord._checkJsonRpcRequest = sandbox.stub().returns(new Error('test'));
      landlord._handleJsonRpcRequest(req, res);
      expect(landlord._checkJsonRpcRequest.callCount).to.equal(1);
      expect(res.send.callCount).to.equal(1);
      expect(res.send.args[0][0]).to.be.instanceOf(Error);
      expect(res.send.args[0][0].message).to.equal('test');
    });

    it('will keep track of the response object and send work', function() {
      var landlord = complex.createLandlord({ requestTimout: 1 });
      var req = {
        body: {
          id: 'someid',
          method: 'getConsignmentPointer',
          params: [{ nodeID: '4b783710baab517de2e3de5bae7e749c9d0e5170' }]
        }
      };
      var res = {};
      landlord._workerSockets = {
        'work-x-4b': { write: sinon.stub() }
      };
      landlord._checkJsonRpcRequest = sandbox.stub();
      landlord._setJsonRpcRequestTimeout = sandbox.stub();
      landlord._handleJsonRpcRequest(req, res);
      expect(landlord._checkJsonRpcRequest.callCount).to.equal(1);
      expect(landlord._setJsonRpcRequestTimeout.callCount).to.equal(1);
      expect(landlord._workerSockets['work-x-4b'].write.callCount).to.equal(1);
      var expected = new Buffer(JSON.stringify(req.body));
      expect(
        landlord._workerSockets['work-x-4b'].write.args[0][0]
      ).to.deep.equal(expected);
    });
  });

  describe('#_getKeyFromRpcMessage', function() {

    it('should use the nodeID of farmer', function() {
      expect(Landlord.prototype._getKeyFromRpcMessage({
        method: 'getStorageProof',
        params: [{ nodeID: 'nodeid' }]
      })).to.equal('nodeid');
    });

    it('should use the data hash of contract', function() {
      expect(Landlord.prototype._getKeyFromRpcMessage({
        method: 'getStorageOffer',
        params: [{ data_hash: 'datahash' }]
      })).to.equal('datahash');
    });

    it('should be random', function() {
      expect(Landlord.prototype._getKeyFromRpcMessage({
        method: 'someUnknownMethod',
        params: []
      })).to.have.lengthOf(2);
    });

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
    var landlord = complex.createLandlord({});

    it('will warn if job completed late', function() {
      var buffer = new Buffer(JSON.stringify({
        hello: 'world'
      }));
      landlord._logger = {
        warn: sandbox.stub()
      };
      landlord._handleWorkResult(buffer);
      expect(landlord._logger.warn.callCount).to.equal(1);
    });

    it('will send error if data has error', function() {
      var buffer = new Buffer(JSON.stringify({
        hello: 'world',
        id: 'someid',
        error: {
          message: 'rabbits are afk'
        }
      }));
      landlord._logger = {
        warn: sandbox.stub(),
        debug: sandbox.stub()
      };
      var send = sandbox.stub();
      landlord._pendingResponses.someid = {
        send: send
      };
      landlord._handleWorkResult(buffer);
      expect(landlord._logger.warn.callCount).to.equal(1);
      expect(landlord._logger.debug.callCount).to.equal(1);
      expect(send.callCount).to.equal(1);
      expect(send.args[0][0]).to.be.instanceOf(Error);
      expect(send.args[0][0].message).to.equal('rabbits are afk');
    });

    it('will send completed work and delete callback', function() {
      var buffer = new Buffer(JSON.stringify({
        hello: 'world',
        id: 'someid',
        result: [
          'value0',
          'value1'
        ]
      }));
      landlord._logger = {
        info: sandbox.stub(),
        debug: sandbox.stub()
      };
      var send = sandbox.stub();
      landlord._pendingResponses.someid = {
        send: send
      };
      landlord._handleWorkResult(buffer);
      expect(landlord._logger.info.callCount).to.equal(1);
      expect(landlord._logger.debug.callCount).to.equal(1);
      expect(send.callCount).to.equal(1);
      expect(landlord._pendingResponses.someid).to.equal(undefined);
      expect(send.callCount).to.equal(1);
      expect(send.args[0][0]).to.deep.equal({
        hello: 'world',
        id: 'someid',
        result: [
          'value0',
          'value1'
        ]
      });
    });
  });

});
