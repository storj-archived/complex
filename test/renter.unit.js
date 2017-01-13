'use strict';
/* jshint maxstatements: 100 */

var EventEmitter = require('events').EventEmitter;
var util = require('util');
var fs = require('fs');
var storj = require('storj-lib');
var Renter = require('../lib/renter');
var kad = storj.deps.kad;
var ReadableStream = require('stream').Readable;
var rabbitmq = require('rabbit.js');
var sinon = require('sinon');
var proxyquire = require('proxyquire');
var expect = require('chai').expect;
var HDKey = require('hdkey');
var complex = require('..');

var seed = 'a0c42a9c3ac6abf2ba6a9946ae83af18f51bf1c9fa7dacc4c92513cc4dd015834' +
    '341c775dcd4c0fac73547c5662d81a9e9361a0aac604a73a321bd9103bce8af';
var key = '08d1015861dd2c09ab36e97a8ecdbae26f20baabede6d618f6fb62904522c7fa';
var migrationKeyPair = storj.KeyPair(key);
var migID = migrationKeyPair.getNodeID();
var masterKey = HDKey.fromMasterSeed(new Buffer(seed, 'hex'));
var hdKey = masterKey.derive('m/3000\'/0\'');
var child = hdKey.deriveChild(10);
var childPriv = child.privateKey.toString('hex');
var pub = 'xpub6BHSRpUigNcUpUAWvcJJrCVnPUvbi8ZUzeRfsipe9ow21YE7eoLhzJ4h' +
    'vkQmEoGMeX3jpwaHp91ycGo1Z4WStsEVBmw1qq6Q3ouPm6GqA4L';
var priv = '979008b562424a0bcd29d82ca6c5c27c7b8e420e17a936752454b9650fac3cd5';
var nodeID = '4abb9b37bd4cbea611c480eb967ad96bf2e3b850';

describe('Renter', function() {

  describe('@constructor', function() {
    var sandbox = sinon.sandbox.create();
    afterEach(function() {
      sandbox.restore();
    });

    it('will construct new instance (with/without new)', function() {
      var options = {
        networkPrivateExtendedKey: hdKey.privateExtendedKey,
        networkIndex: 10,
        migrationPrivateKey: key
      };
      var renter = complex.createRenter(options);
      var renter2 = new complex.createRenter(options);
      expect(renter).to.be.instanceOf(complex.createRenter);
      expect(renter2).to.be.instanceOf(complex.createRenter);
    });

    it('will contruct with a config object', function() {
      var config = {
        type: 'Renter',
        opts: {
          logLevel: 3,
          amqpUrl: 'amqp://localhost',
          amqpOpts: {},
          mongoUrl: 'mongodb://localhost:27017/storj-test',
          mongoOpts: {},
          networkPrivateExtendedKey: '/tmp/storj-complex/hd-private.key',
          networkIndex: 10,
          migrationPrivateKey: '/tmp/storj-complex/private.key',
          networkOpts: {
            rpcPort: 4000,
            rpcAddress: 'localhost',
            doNotTraverseNat: true,
            tunnelServerPort: 5000,
            tunnelGatewayRange: {
              min: 0,
              max: 0
            },
            maxTunnels: 0,
            seedList: [],
            bridgeUri: null,
            maxConnections: 250
          }
        }
      };
      sandbox.stub(fs, 'readFileSync');
      fs.readFileSync.onFirstCall().returns(JSON.stringify(config));
      fs.readFileSync.onSecondCall().returns(hdKey.privateExtendedKey);
      fs.readFileSync.onThirdCall().returns(priv);
      var conf = complex.createConfig('/tmp/someconfig.json');
      var renter = complex.createRenter(conf);
      expect(renter.migrationKeyPair.getPrivateKey()).to.equal(priv);
      expect(renter.keyPair.getPrivateKey()).to.equal(childPriv);
    });

    it('will construct with hd private key', function() {
      var options = {
        networkPrivateExtendedKey: hdKey.privateExtendedKey,
        networkIndex: 10
      };
      var renter = complex.createRenter(options);
      expect(renter).to.be.instanceOf(complex.createRenter);
      expect(renter.hdKey);
      expect(renter.keyPair.getPrivateKey()).to.equal(priv);
      expect(renter.hdKey.publicExtendedKey).to.equal(pub);
    });

  });

  describe('#_initStorage', function() {
    it('will instantiate storage', function() {
      var options = {
        networkPrivateExtendedKey: hdKey.privateExtendedKey,
        networkIndex: 10,
        mongoUrl: 'mongodb://localhost:37017/storj-test',
        mongoOpts: {
          hello: 'world'
        }
      };
      var Storage = sinon.stub();
      var TestRenter = proxyquire('../lib/renter', {
        'storj-service-storage-models': Storage
      });

      var renter = new TestRenter(options);
      renter._initStorage();
      expect(renter.storage).to.be.instanceOf(Storage);
      expect(Storage.args[0][0])
        .to.equal('mongodb://localhost:37017/storj-test');
      expect(Storage.args[0][1])
        .to.deep.equal({ hello: 'world' });
      expect(Storage.args[0][2].logger)
        .to.be.instanceOf(require('kad-logger-json'));
    });
  });

  describe('#_initNetwork', function() {
    var sandbox = sinon.sandbox.create();
    afterEach(function() {
      sandbox.restore();
    });
    it('will initialize network', function(done) {
      var options = {
        networkPrivateExtendedKey: hdKey.privateExtendedKey,
        networkIndex: 10,
        networkOpts: {
          rpcPort: 8000,
          rpcAddress: '127.0.0.1',
          doNotTraverseNat: true,
          maxTunnels: 10,
          tunnelGatewayRange: {},
          bridgeUri: 'http://localhost',
          seedList: [
            'storj://127.0.0.1:3000/955af05f3130ac5c70952a34a9aa710c9fbf812b'
          ],
          maxConnections: 10
        },
      };
      var StorageManager = function() {};
      util.inherits(StorageManager, storj.StorageManager);
      sandbox.stub(storj, 'StorageManager', StorageManager);
      var Renter = proxyquire('../lib/renter', {
        'storj-mongodb-adapter': function() {}
      });
      var renter = new Renter(options);
      var seeds = [
        'storj://127.0.0.1:3000/955af05f3130ac5c70952a34a9aa710c9fbf812b'
      ];
      renter._initNetwork(seeds);
      expect(renter.network).to.be.instanceOf(storj.Renter);
      expect(renter.network.hdKey.privateExtendedKey).to.equal(
        options.networkPrivateExtendedKey
      );
      expect(renter.network.hdIndex).to.equal(10);
      expect(renter.network._options.bridgeUri)
        .to.equal('http://localhost');
      expect(renter.network._options.seedList).to.deep.equal([
        'storj://127.0.0.1:3000/955af05f3130ac5c70952a34a9aa710c9fbf812b',
        'storj://127.0.0.1:3000/955af05f3130ac5c70952a34a9aa710c9fbf812b'
      ]);
      expect(renter.network._options.rpcPort).to.equal(8000);
      expect(renter.network._options.rpcAddress).to.equal('127.0.0.1');
      expect(renter.network._options.doNotTraverseNat).to.equal(true);
      expect(renter.network._options.maxTunnels).to.equal(10);
      expect(renter.network._options.maxConnections).to.equal(10);
      sandbox.stub(renter._logger, 'warn');
      expect(renter._logger.warn.callCount).to.equal(0);
      renter.network.emit('error', new Error('test'));
      expect(renter._logger.warn.callCount).to.equal(1);
      done();
    });
  });

  describe('#start', function() {
    var sandbox = sinon.sandbox.create();
    afterEach(function() {
      sandbox.restore();
    });
    var options = {
      networkPrivateExtendedKey: hdKey.privateExtendedKey,
      networkIndex: 10
    };
    it('it will handle error seeds query', function(done) {
      var renter = complex.createRenter(options);
      renter._initStorage = sinon.stub();
      renter._loadKnownSeeds = sinon.stub().callsArgWith(0, new Error('test'));
      renter.start(function(err) {
        expect(err).to.be.instanceOf(Error);
        expect(err.message).to.equal('test');
        done();
      });
    });
    it('it will init message bus', function(done) {
      var renter = complex.createRenter(options);
      renter._initStorage = sinon.stub();
      renter._initNetwork = sinon.stub();
      var amqpContext = new EventEmitter();
      sandbox.stub(rabbitmq, 'createContext').returns(amqpContext);
      sandbox.stub(Renter.prototype, '_initMessageBus', function() {
        this.emit('ready');
      });
      var seeds = [
        'storj://127.0.0.1:3000/955af05f3130ac5c70952a34a9aa710c9fbf812b'
      ];
      renter._loadKnownSeeds = sinon.stub().callsArgWith(0, null, seeds);
      renter.start(function(err) {
        expect(err).to.be.equal(undefined);
        done();
      });
      amqpContext.emit('ready');
    });
    it('will callback with error from emit', function(done) {
      var renter = complex.createRenter(options);
      renter._initStorage = sinon.stub();
      renter._initNetwork = sinon.stub();
      var amqpContext = new EventEmitter();
      sandbox.stub(rabbitmq, 'createContext').returns(amqpContext);
      sandbox.stub(Renter.prototype, '_initMessageBus', function() {
        this.emit('ready');
      });
      var seeds = [
        'storj://127.0.0.1:3000/955af05f3130ac5c70952a34a9aa710c9fbf812b'
      ];
      renter._loadKnownSeeds = sinon.stub().callsArgWith(0, null, seeds);
      renter.start(function(err) {
        expect(err).to.be.instanceOf(Error);
        expect(err.message).to.equal('test');
        done();
      });
      renter.emit('error', new Error('test'));
    });
  });

  describe('_loadKnownSeeds', function() {
    var options = {
      networkPrivateExtendedKey: hdKey.privateExtendedKey,
      networkIndex: 10
    };
    it('will load latest contacts by url', function() {
      var renter = complex.createRenter(options);
      var contacts = [
        new storj.Contact({
          address: '127.0.0.1',
          port: 3000
        })
      ];
      var exec = sinon.stub().callsArgWith(0, null, contacts);
      var limit = sinon.stub().returns({
        exec: exec
      });
      var sort = sinon.stub().returns({
        limit: limit
      });
      var find = sinon.stub().returns({
        sort: sort
      });
      renter.storage = {
        models: {
          Contact: {
            find: find
          }
        }
      };
      renter._loadKnownSeeds(function(err, contacts) {
        expect(err).to.equal(null);
        expect(contacts).to.deep.equal([
          'storj://127.0.0.1:3000/955af05f3130ac5c70952a34a9aa710c9fbf812b'
        ]);
      });
    });
    it('will handle error from storage', function() {
      var renter = complex.createRenter(options);
      var exec = sinon.stub().callsArgWith(0, new Error('test'));
      var limit = sinon.stub().returns({
        exec: exec
      });
      var sort = sinon.stub().returns({
        limit: limit
      });
      var find = sinon.stub().returns({
        sort: sort
      });
      renter.storage = {
        models: {
          Contact: {
            find: find
          }
        }
      };
      renter._loadKnownSeeds(function(err) {
        expect(err).to.be.instanceOf(Error);
        expect(err.message).to.equal('test');
      });
    });
  });

  describe('_getQueueSpan', function() {
    var options = {
      networkPrivateExtendedKey: hdKey.privateExtendedKey,
      networkIndex: 10
    };
    it('0 renter', function() {
      var renter = complex.createRenter(options);
      expect(function() {
        renter._getQueueSpan(256, 0, 0.999);
      }).to.throw('y is expected');
    });
    it('Infinity renter', function() {
      var renter = complex.createRenter(options);
      expect(function() {
        renter._getQueueSpan(256, Infinity, 0.999);
      }).to.throw('y is expected');
    });
    it('NaN renter', function() {
      var renter = complex.createRenter(options);
      expect(function() {
        renter._getQueueSpan(256, NaN, 0.999);
      }).to.throw('y is expected');
    });
    it('1 renter', function() {
      var renter = complex.createRenter(options);
      var span = renter._getQueueSpan(256, 1, 0.999);
      expect(Math.ceil(span)).to.equal(256);
    });
    it('2 renters', function() {
      var renter = complex.createRenter(options);
      var span = renter._getQueueSpan(256, 2, 0.999);
      expect(Math.ceil(span)).to.equal(248);
    });
    it('3 renters', function() {
      var renter = complex.createRenter(options);
      var span = renter._getQueueSpan(256, 3, 0.999);
      expect(Math.ceil(span)).to.equal(231);
    });
    it('4 renters', function() {
      var renter = complex.createRenter(options);
      var span = renter._getQueueSpan(256, 4, 0.999);
      expect(Math.ceil(span)).to.equal(211);
    });
    it('32 renters', function() {
      var renter = complex.createRenter(options);
      var span = renter._getQueueSpan(256, 32, 0.999);
      expect(Math.ceil(span)).to.equal(50);
    });
    it('64 renters', function() {
      var renter = complex.createRenter(options);
      var span = renter._getQueueSpan(256, 64, 0.999);
      expect(Math.ceil(span)).to.equal(27);
    });
    it('96 renters', function() {
      var renter = complex.createRenter(options);
      var span = renter._getQueueSpan(256, 96, 0.999);
      expect(Math.ceil(span)).to.equal(18);
    });
    it('128 renters', function() {
      var renter = complex.createRenter(options);
      var span = renter._getQueueSpan(256, 128, 0.999);
      expect(Math.ceil(span)).to.equal(14);
    });
    it('160 renters', function() {
      var renter = complex.createRenter(options);
      var span = renter._getQueueSpan(256, 160, 0.999);
      expect(Math.ceil(span)).to.equal(11);
    });
    it('192 renters', function() {
      var renter = complex.createRenter(options);
      var span = renter._getQueueSpan(256, 192, 0.999);
      expect(Math.ceil(span)).to.equal(10);
    });
    it('224 renters', function() {
      var renter = complex.createRenter(options);
      var span = renter._getQueueSpan(256, 224, 0.999);
      expect(Math.ceil(span)).to.equal(8);
    });
    it('256 renters', function() {
      var renter = complex.createRenter(options);
      var span = renter._getQueueSpan(256, 256, 0.999);
      expect(Math.ceil(span)).to.equal(7);
    });
  });

  describe('_getQueueOffset', function() {
    var options = {
      networkPrivateExtendedKey: hdKey.privateExtendedKey,
      networkIndex: 10,
      totalRenters: 160,
      renterOverlap: 3
    };
    it('should multiply span by overlap and give half the result', function() {
      var renter = complex.createRenter(options);
      var offset = renter._getQueueOffset();
      expect(offset).to.equal(17);
    });
  });

  describe('_initMessageBus', function() {
    var sandbox = sinon.sandbox.create();
    afterEach(function() {
      sandbox.restore();
    });
    var options = {
      networkPrivateExtendedKey: hdKey.privateExtendedKey,
      networkIndex: 10,
      totalRenters: 256,
      renterOverlap: 1
    };
    it('setup sockets, connect, join network and handle work', function() {
      sandbox.stub(Renter.prototype, '_handleWork');
      var renter = complex.createRenter(options);
      renter._handleNetworkEvents = sinon.stub();
      renter.network = {
        join: sinon.stub().callsArg(0),
        contact: { nodeID: '4b783710baab517de2e3de5bae7e749c9d0e5170' }
      };
      var pubSocket = new EventEmitter();
      pubSocket.connect = sinon.stub();
      var workSockets = [
        new EventEmitter(),
        new EventEmitter(),
        new EventEmitter(),
        new EventEmitter(),
        new EventEmitter(),
        new EventEmitter(),
        new EventEmitter(),
        new EventEmitter(),
        new EventEmitter()
      ];
      workSockets.forEach(function(s) {
        s.connect = sinon.stub();
      });
      renter._amqpContext = {
        socket: function(method) {
          switch(method) {
            case 'PUBLISH':
              return pubSocket;
            case 'WORKER':
              return workSockets.shift();
          }
        }
      };
      renter._initMessageBus();
      expect(renter.network.join.callCount).to.equal(1);
      expect(pubSocket.connect.callCount).to.equal(1);
      expect(pubSocket.connect.args[0][0]).to.equal('work.close');
      expect(renter.workers['work-x-47'].connect.callCount).to.equal(1);
      expect(renter.workers['work-x-48'].connect.callCount).to.equal(1);
      expect(renter.workers['work-x-49'].connect.callCount).to.equal(1);
      expect(renter.workers['work-x-4a'].connect.callCount).to.equal(1);
      expect(renter.workers['work-x-4b'].connect.callCount).to.equal(1);
      expect(renter.workers['work-x-4c'].connect.callCount).to.equal(1);
      expect(renter.workers['work-x-4d'].connect.callCount).to.equal(1);
      expect(renter.workers['work-x-4e'].connect.callCount).to.equal(1);
      expect(renter.workers['work-x-4f'].connect.callCount).to.equal(1);
      var data = {};
      renter.workers['work-x-47'].emit('data', data);
      expect(Renter.prototype._handleWork.callCount).to.equal(1);
      expect(Renter.prototype._handleWork.args[0][0]).to.be.instanceOf(
        EventEmitter
      );
      expect(Renter.prototype._handleWork.args[0][1]).to.equal(data);
      expect(renter._handleNetworkEvents.callCount).to.equal(1);
    });
    it('will emit error from network join', function(done) {
      sandbox.stub(Renter.prototype, '_handleWork');
      var renter = complex.createRenter(options);
      renter._handleNetworkEvents = sinon.stub();
      renter.network = {
        join: sinon.stub().callsArgWith(0, new Error('test')),
        contact: { nodeID: '4b783710baab517de2e3de5bae7e749c9d0e5170' }
      };
      var pubSocket = new EventEmitter();
      pubSocket.connect = sinon.stub();
      var workSocket = new EventEmitter();
      workSocket.connect = sinon.stub();
      renter._amqpContext = {
        socket: function(method) {
          switch(method) {
            case 'PUBLISH':
              return pubSocket;
            case 'WORKER':
              return workSocket;
          }
        }
      };
      renter.on('error', function(err) {
        expect(err.message).to.equal('test');
        done();
      });
      renter._initMessageBus();
    });
  });

  describe('_onContactAdded', function() {
    var options = {
      networkPrivateExtendedKey: hdKey.privateExtendedKey,
      networkIndex: 10
    };
    it('will record contact', function() {
      var renter = complex.createRenter(options);
      var contact = storj.Contact({
        address: '127.0.0.1',
        port: 3000
      });
      var record = sinon.stub();
      renter.storage = {
        models: {
          Contact: {
            record: record
          }
        }
      };
      renter._onContactAdded(contact);
      expect(record.callCount).to.equal(1);
    });
  });

  describe('#_handleNetworkEvents', function() {
    var sandbox = sinon.sandbox.create();
    afterEach(function() {
      sandbox.restore();
    });
    var options = {
      networkPrivateExtendedKey: hdKey.privateExtendedKey,
      networkIndex: 10
    };

    it('will add contact with router add and shift', function(done) {
      var renter = complex.createRenter(options);
      sandbox.stub(Renter.prototype, '_onContactAdded');
      var router = new EventEmitter();
      renter.network = {
        router: router
      };
      sinon.spy(renter.network.router, 'on');
      renter.on('ready', function() {
        expect(router.on.callCount).to.equal(2);
        var data = {};
        router.emit('add', data);
        router.emit('shift', data);
        expect(Renter.prototype._onContactAdded.callCount).to.equal(2);
        done();
      });
      renter._handleNetworkEvents();
    });

  });

  describe('#_handleWork', function() {
    var options = {
      networkPrivateExtendedKey: hdKey.privateExtendedKey,
      networkIndex: 10
    };

    it('will give method not found message', function() {
      var renter = complex.createRenter(options);
      renter.workers = {
        test: { ack: sinon.stub() }
      };
      var write = sinon.stub();
      renter.notifier = {
        write: write
      };
      var buffer = new Buffer(JSON.stringify({
        method: 'someUnknownMethod',
        id: 'someid'
      }));
      renter._handleWork(renter.workers.test, buffer);
      expect(write.callCount).to.equal(1);
      expect(JSON.parse(write.args[0][0].toString())).to.deep.equal({
        id: 'someid',
        error: {
          code: -32601,
          message: 'Method not found'
        }
      });
      expect(renter.workers.test.ack.callCount).to.equal(1);
    });

    it('will handle ping command', function() {
      var renter = complex.createRenter(options);
      renter.workers = {
        test: { ack: sinon.stub() }
      };
      var write = sinon.stub();
      renter.notifier = {
        write: write
      };
      var contact = {};
      var buffer = new Buffer(JSON.stringify({
        method: 'ping',
        id: 'someid',
        params: [contact]
      }));
      renter.network = {
        ping: sinon.stub().callsArgWith(1, null, {})
      };
      renter._handleWork(renter.workers.test, buffer);
      expect(write.callCount).to.equal(1);
      expect(JSON.parse(write.args[0][0].toString())).to.deep.equal({
        id: 'someid',
        result: [
          null,
          {}
        ]
      });
      expect(renter.workers.test.ack.callCount).to.equal(1);
    });

    it('will serialize/deserialize args with redirected method', function() {
      var renter = complex.createRenter(options);
      var pointer = {
        farmer: storj.Contact({
          address: '127.0.0.1',
          port: 3000
        }),
        hash: 'fad8d3a30b5d40dae9e61f7f84bf9017e9f4bb2f',
        token: '02d8b561ac9297cf2d67fe5d8fe673305e84e40a',
        operation: 'PULL'
      };
      renter._getRetrievalPointer = sinon.stub().callsArgWith(2, null, pointer);
      renter.workers = {
        test: { ack: sinon.stub() }
      };
      var write = sinon.stub();
      renter.notifier = {
        write: write
      };
      var buffer = new Buffer(JSON.stringify({
        method: 'getRetrievalPointer',
        id: 'someid',
        params: [
          {
            address: '127.0.0.1',
            port: 3000
          },
          {
            data_hash: '2418003db2a20ea6b99d8efaa61aecb5acbb96a9'
          }
        ]
      }));
      renter._handleWork(renter.workers.test, buffer);
      expect(write.callCount).to.equal(1);
      var parsed = JSON.parse(write.args[0][0].toString());
      // remove last seen property that changes
      expect(parsed.result[1].farmer.lastSeen).to.be.a('number');
      expect(parsed.result[1].farmer.userAgent).to.be.a('string');
      delete parsed.result[1].farmer.lastSeen;
      delete parsed.result[1].farmer.userAgent;
      expect(parsed).to.deep.equal({
        id: 'someid',
        result: [
          null,
          {
            farmer: {
              address: '127.0.0.1',
              nodeID: '955af05f3130ac5c70952a34a9aa710c9fbf812b',
              port: 3000,
              protocol: '1.0.0'
            },
            hash: 'fad8d3a30b5d40dae9e61f7f84bf9017e9f4bb2f',
            operation: 'PULL',
            token: '02d8b561ac9297cf2d67fe5d8fe673305e84e40a'
          }
        ]
      });
      expect(renter.workers.test.ack.callCount).to.equal(1);
    });

    it('will serialize/deserialize args for non-redirect', function() {
      var proof = [
        [
          [
            [
              '7947625e0e424ebe07d3403dce4088f673215ea0',
              [
                '8813e458e1a20c434eb1d5336d07778d01c9553a'
              ]
            ],
            'fb9c71c9c60616e4fc22a537a9ebab1eeca441dc'
          ],
          '4f6cab6a8a7623bb31d27243a0548687f4fcf159'
        ],
        '07a925e3bb75cfc5e00e15207e4a90ee6c897513'
      ];
      var renter = complex.createRenter(options);
      renter.workers = {
        test: { ack: sinon.stub() }
      };
      renter.network = {
        getStorageProof: sinon.stub().callsArgWith(2, null, proof)
      };
      var write = sinon.stub();
      renter.notifier = {
        write: write
      };
      var farmer = {
        address: '127.0.0.1',
        port: 3000
      };
      var item = {};
      var buffer = new Buffer(JSON.stringify({
        method: 'getStorageProof',
        id: 'someid',
        params: [ farmer, item ]
      }));
      renter._handleWork(renter.workers.test, buffer);
      expect(write.callCount).to.equal(1);
      var parsed = JSON.parse(write.args[0][0].toString());
      expect(parsed).to.deep.equal({
        id: 'someid',
        result: [ null, proof ]
      });
      expect(renter.workers.test.ack.callCount).to.equal(1);
    });

    it('will give error from calling method', function() {
      var renter = complex.createRenter(options);
      renter.workers = {
        test: { ack: sinon.stub() }
      };
      renter.network = {
        getStorageProof: sinon.stub().callsArgWith(2, new Error('test'))
      };
      var write = sinon.stub();
      renter.notifier = {
        write: write
      };
      var farmer = {
        address: '127.0.0.1',
        port: 3000
      };
      var item = {};
      var buffer = new Buffer(JSON.stringify({
        method: 'getStorageProof',
        id: 'someid',
        params: [ farmer, item ]
      }));
      renter._handleWork(renter.workers.test, buffer);
      expect(write.callCount).to.equal(1);
      var parsed = JSON.parse(write.args[0][0].toString());
      expect(parsed).to.deep.equal({
        id: 'someid',
        error: {
          code: -32603,
          message: 'test'
        }
      });
      expect(renter.workers.test.ack.callCount).to.equal(1);
    });

    it('will give error if calling method', function() {
      var renter = complex.createRenter(options);
      renter.workers = {
        test: { ack: sinon.stub() }
      };
      renter.network = {
        getStorageProof: sinon.stub().throws(new Error('test'))
      };
      var write = sinon.stub();
      renter.notifier = {
        write: write
      };
      var farmer = {
        address: '127.0.0.1',
        port: 3000
      };
      var item = {};
      var buffer = new Buffer(JSON.stringify({
        method: 'getStorageProof',
        id: 'someid',
        params: [ farmer, item ]
      }));
      renter._handleWork(renter.workers.test, buffer);
      expect(write.callCount).to.equal(1);
      var parsed = JSON.parse(write.args[0][0].toString());
      expect(parsed).to.deep.equal({
        id: 'someid',
        error: {
          code: -32603,
          message: 'test'
        }
      });
      expect(renter.workers.test.ack.callCount).to.equal(1);
    });

  });

  describe('#_deserializeArguments', function() {
    var options = {
      networkPrivateExtendedKey: hdKey.privateExtendedKey,
      networkIndex: 10
    };
    var renter = complex.createRenter(options);

    it('unknown', function() {
      var method = 'someUnknownMethod';
      var args = [];
      var result = renter._deserializeArguments(method, args);
      expect(result).to.equal(args);
    });

    it('getConsignmentPointer', function() {
      var method = 'getConsignmentPointer';
      var tree = [
        '45bd496c4f4c1235270c6b2e1f60b051a3a609bf',
        'fa767b00186859ade0f6033c048515a606958f37',
        'e5a7999ce6918f5a6ce4210ce759a4f488e6ec19',
        '3854f7744f819a6ad5a5acfbe543463f11e5b978',
        'cc884402e2c94e832677c76c01381d326417d6ff',
        'e663e3fea469de55a6f0690774d9123adb81fb16',
        '938b03c7211b9bb835e1d41095104b61ce5b47e9',
        'b07bdcba08b5f7a1e839af4764c3041a0ef72129',
        'b793fd829212c6c52625ab5ee1f605aca28560b7',
        '591ffe7603132d3be32abba6a746d12146dd29e4',
        '402a766c6ab4fe3057495dc8306c63b5a32f56d6',
        'a422d62c676dadbda2f6616f3cb7225544f3c6ba',
        'b472a266d0bd89c13706a4132ccfb16f7c3b9fcb',
        'b472a266d0bd89c13706a4132ccfb16f7c3b9fcb',
        'b472a266d0bd89c13706a4132ccfb16f7c3b9fcb',
        'b472a266d0bd89c13706a4132ccfb16f7c3b9fcb'
      ];
      var challenges = [
        '278f5e8ea2f624639f4eb25ff4524bb3ba67d01a4eb24ad27a30d242470c46ab',
        'c4b0546b7acf886083716bf792eee10bf7e4c4a55c6aee5b6575ea7e4d762ed4',
        'dcd658b08a5f723ef2112bbe5df4b796c868bd3c9aeee977db56c66179ec7c2e',
        '02bcfc4d067a3b7117fd2a09af14d963163d22dd25f81add2adc0e6075c41e3e',
        '9b35f8237d1775aaceeee7c93671209fb008481d0fc503cc8ff58778024d0aaf',
        '8789d3ef05104a56e143cb4ae51876ca4dbb9f7e8a03b2732013a87ed20a617e',
        'ce3d32ec8fabf7d0b1d88391263f7b6bf866d892ee088a0733593d8406d7f762',
        '966b5c1335737eae1c95b8a0ce5f119bcf7474ff25e22c4a40d0ba061da3e8cf',
        'c9077b70604bd173c7afa9503e7966a3d756d25fef217ff50d95c428a7e65b84',
        '9fbf381169f3d63b859a39005390a55d8f44077d913a62fa2dbe8826c9a088e8',
        '565a057e85a8d69d2ff8b6a1dd9be0747810a614d2f0baaecdca4bb7331bbb98',
        '9fe899bf30071a68e05ed6139623fce8ee1c4ac22d43bdf2d89c95577e7e4a4d'
      ];
      var args = [
        {
          address: '127.0.0.1',
          port: 3000
        },
        {
          data_hash: '2418003db2a20ea6b99d8efaa61aecb5acbb96a9'
        },
        {
          challenges: challenges,
          tree: tree
        }
      ];
      var result = renter._deserializeArguments(method, args);
      expect(result[0]).to.be.instanceOf(storj.Contact);
      expect(result[1]).to.be.instanceOf(storj.Contract);
      expect(result[2]).to.be.instanceOf(storj.AuditStream);
    });

    it('getRetrievalPointer', function() {
      var method = 'getRetrievalPointer';
      var args = [
        {
          address: '127.0.0.1',
          port: 3000
        },
        {
          data_hash: '2418003db2a20ea6b99d8efaa61aecb5acbb96a9'
        }
      ];
      var result = renter._deserializeArguments(method, args);
      expect(result[0]).to.be.instanceOf(storj.Contact);
      expect(result[1]).to.be.instanceOf(storj.Contract);
    });

    it('getMirrorNodes', function() {
      var method = 'getMirrorNodes';
      var args = [
        [
          {
            farmer: {
              address: '127.0.0.1',
              port: 3000
            },
            hash: '12981a76bb34888d66eda35800b6487ce39f3a8f',
            token: 'ebef6003e8cc51506506135358849d8cdd57083c',
            operation: 'PULL'
          },
          {
            farmer: {
              address: '127.0.0.1',
              port: 3000
            },
            hash: 'f960e92855e446ad0dc1140672c102d80515592b',
            token: '3f58ea32411452218ae230a7365d8be588e267c6',
            operation: 'PUSH'
          }
        ],
        [
          {
            address: '127.0.0.1',
            port: 3000
          },
          {
            address: '127.0.0.1',
            port: 3000
          }
        ]
      ];
      var result = renter._deserializeArguments(method, args);
      result[1].forEach(function(data) {
        expect(data).to.be.instanceOf(storj.Contact);
      });
    });

    it('getStorageProof', function() {
      var method = 'getStorageProof';
      var args = [
        {
          address: '127.0.0.1',
          port: 3000
        },
        {
          hash: null,
          shard: null,
          contracts: {
            b0e469be9f453521e8c55c60a48a9ebd2d6d4cb0: {
              audit_count: 12,
              data_hash: 'b472a266d0bd89c13706a4132ccfb16f7c3b9fcb',
              data_size: 1234,
              farmer_id: null,
              farmer_signature: null,
              payment_destination: null,
              payment_download_price: 0,
              payment_storage_price: 0,
              renter_hd_index: false,
              renter_hd_key: false,
              renter_id: 'b0e469be9f453521e8c55c60a48a9ebd2d6d4cb0',
              renter_signature: null,
              store_begin: 1478022147655,
              store_end: 1478022157655,
              version: 0
            }
          },
          challenges: {},
          trees: {},
          meta: {},
          modified: 1478022147655
        }
      ];
      var result = renter._deserializeArguments(method, args);
      expect(result[0]).to.be.instanceOf(storj.Contact);
      expect(result[1]).to.be.instanceOf(storj.StorageItem);
    });

    it('getStorageOffer (with blacklist)', function() {
      var method = 'getStorageOffer';
      var args = [
        {
          data_hash: '2418003db2a20ea6b99d8efaa61aecb5acbb96a9'
        },
        [
          '96cd708741b10d346ddef9b973b44613887ff995',
          'caca1969435d738a7a679a455d51a0f1663db58a'
        ]
      ];
      var result = renter._deserializeArguments(method, args);
      expect(result[0]).to.be.instanceOf(storj.Contract);
      expect(Array.isArray(result[1])).to.equal(true);
      expect(result[1]).to.equal(args[1]);
    });

    it('getStorageOffer (without blacklist)', function() {
      var method = 'getStorageOffer';
      var args = [
        {
          data_hash: '2418003db2a20ea6b99d8efaa61aecb5acbb96a9'
        },
        function() {}
      ];
      var result = renter._deserializeArguments(method, args);
      expect(result[0]).to.be.instanceOf(storj.Contract);
      expect(Array.isArray(result[1])).to.equal(true);
      expect(result[1]).to.deep.equal([]);
    });

  });

  describe('#_serializeArguments', function() {
    var options = {
      networkPrivateExtendedKey: hdKey.privateExtendedKey,
      networkIndex: 10
    };
    var renter = complex.createRenter(options);

    var unchanged = [
      'getConsignmentPointer',
      'getRetrievalPointer',
      'getMirrorNodes',
      'getStorageProof',
      'etcetera'
    ];

    unchanged.forEach(function(method) {
      it('unchanged: ' + method, function() {
        var args = [];
        var result = renter._serializeArguments(method, args);
        expect(result).to.equal(args);
      });
    });

    it('getStorageOffer', function() {
      var method = 'getStorageOffer';
      var contact = new storj.Contact({
        address: '127.0.0.1',
        port: 3000
      });
      var contract = new storj.Contract();
      var args = [
        null,
        contact,
        contract
      ];
      var result = renter._serializeArguments(method, args);
      expect(result).to.equal(args);
      expect(result[2]).to.not.be.instanceOf(storj.Contract);
    });

  });

  describe('#_signStorageContract', function() {

    it('will set the hd props on the contract', function() {
      var options = {
        networkPrivateExtendedKey: hdKey.privateExtendedKey,
        networkIndex: 10
      };
      var renter = complex.createRenter(options);
      var contract = {
        set: sinon.stub(),
        sign: sinon.stub()
      };
      renter._signStorageContract(contract);
      expect(contract.set.callCount).to.equal(3);
      expect(contract.set.args[0][0]).to.equal('renter_hd_key');
      expect(contract.set.args[0][1]).to.equal(pub);
      expect(contract.set.args[1][0]).to.equal('renter_hd_index');
      expect(contract.set.args[1][1]).to.equal(10);
      expect(contract.set.args[2][0]).to.equal('renter_id');
      expect(contract.set.args[2][1]).to.equal(nodeID);
      expect(contract.sign.callCount).to.equal(1);
      expect(contract.sign.args[0][0]).to.equal('renter');
      expect(contract.sign.args[0][1]).to.equal(priv);
    });

  });

  describe('#_getRetrievalPointer', function() {
    it('will handle error from renew contract', function(done) {
      var options = {
        networkPrivateExtendedKey: hdKey.privateExtendedKey,
        networkIndex: 10,
        migrationPrivateKey: key
      };
      var renter = complex.createRenter(options);
      var contact = {};
      var contract = {
        get: sinon.stub().returns(undefined)
      };
      renter._renewContract = sinon.stub().callsArgWith(2, new Error('test'));
      renter._getRetrievalPointer(contact, contract, function(err) {
        expect(err).to.be.instanceOf(Error);
        done();
      });
    });

    it('will not renew without migration key', function(done) {
      var options = {
        networkPrivateExtendedKey: hdKey.privateExtendedKey,
        networkIndex: 10
      };
      var renter = complex.createRenter(options);
      renter._renewContract = sinon.stub();
      renter.network = {
        getRetrievalPointer: sinon.stub().callsArg(2)
      };
      var contract = {};
      var contact = {};
      renter._getRetrievalPointer(contact, contract, function() {
        expect(renter.network.getRetrievalPointer.callCount)
          .to.equal(1);
        expect(renter.network.getRetrievalPointer.args[0][0])
          .to.equal(contact);
        expect(renter.network.getRetrievalPointer.args[0][1])
          .to.equal(contract);
        expect(renter._renewContract.callCount).to.equal(0);
        done();
      });
    });

    it('will not renew if contract already has hd key', function(done) {
      var options = {
        networkPrivateExtendedKey: hdKey.privateExtendedKey,
        networkIndex: 10,
        migrationPrivateKey: key
      };
      var renter = complex.createRenter(options);
      renter._renewContract = sinon.stub();
      renter.network = {
        getRetrievalPointer: sinon.stub().callsArg(2)
      };
      var contract = new storj.Contract();
      contract.set('renter_hd_key', hdKey.publicExtendedKey);
      var contact = {};
      renter._getRetrievalPointer(contact, contract, function() {
        expect(renter.network.getRetrievalPointer.callCount)
          .to.equal(1);
        expect(renter.network.getRetrievalPointer.args[0][0])
          .to.equal(contact);
        expect(renter.network.getRetrievalPointer.args[0][1])
          .to.equal(contract);
        expect(renter._renewContract.callCount).to.equal(0);
        done();
      });
    });

    it('will renew and get pointer', function(done) {
      var options = {
        networkPrivateExtendedKey: hdKey.privateExtendedKey,
        networkIndex: 10,
        migrationPrivateKey: key
      };
      var renter = complex.createRenter(options);
      renter._renewContract = sinon.stub().callsArg(2);
      renter.network = {
        getRetrievalPointer: sinon.stub().callsArg(2)
      };
      var contract = new storj.Contract();
      var contact = {};
      renter._getRetrievalPointer(contact, contract, function() {
        expect(renter.network.getRetrievalPointer.callCount)
          .to.equal(1);
        expect(renter.network.getRetrievalPointer.args[0][0])
          .to.equal(contact);
        expect(renter.network.getRetrievalPointer.args[0][1])
          .to.equal(contract);
        expect(renter._renewContract.callCount).to.equal(1);
        done();
      });
    });
  });

  describe('#_renewContract', function() {
    var options = {
      networkPrivateExtendedKey: hdKey.privateExtendedKey,
      networkIndex: 10,
      migrationPrivateKey: key
    };
    it('will handle error from transport', function(done) {
      var renter = complex.createRenter(options);
      var contact = {};
      var contract = {
        toObject: sinon.stub()
      };
      renter._signStorageContract = sinon.stub();
      renter._renewContractMessage = sinon.stub();
      renter.network = {
        transport: {
          send: sinon.stub().callsArgWith(2, new Error('test'))
        }
      };
      renter._renewContract(contact, contract, function(err) {
        expect(err).to.be.instanceOf(Error);
        expect(err.message).to.equal('test');
        done();
      });
    });
    it('will handle error from farmer', function(done) {
      var renter = complex.createRenter(options);
      var contact = {};
      var contract = {
        toObject: sinon.stub()
      };
      renter._signStorageContract = sinon.stub();
      renter._renewContractMessage = sinon.stub();
      renter.network = {
        transport: {
          send: sinon.stub().callsArgWith(2, null, {
            error: {
              message: 'test'
            }
          })
        }
      };
      renter._renewContract(contact, contract, function(err) {
        expect(err).to.be.instanceOf(Error);
        expect(err.message).to.equal('test');
        done();
      });
    });
    it('will handle invalid contract from farmer', function(done) {
      var renter = complex.createRenter(options);
      var contact = {};
      var contract = {
        toObject: sinon.stub()
      };
      renter._signStorageContract = sinon.stub();
      renter._renewContractMessage = sinon.stub();
      renter._validRenewedContract = sinon.stub().returns(false);
      renter.network = {
        transport: {
          send: sinon.stub().callsArgWith(2, null, {
            result: {
              contract: contract
            }
          })
        }
      };
      renter._renewContract(contact, contract, function(err) {
        expect(err).to.be.instanceOf(Error);
        expect(err.message).to.equal('Invalid farmer contract');
        done();
      });
    });
    it('will save valid renewed contract', function(done) {
      var renter = complex.createRenter(options);
      var contact = {};
      var contract = {
        toObject: sinon.stub()
      };
      renter._signStorageContract = sinon.stub();
      renter._renewContractMessage = sinon.stub();
      renter._validRenewedContract = sinon.stub().returns(true);
      renter._saveRenewedContract = sinon.stub().callsArg(1);
      renter.network = {
        transport: {
          send: sinon.stub().callsArgWith(2, null, {
            result: {
              contract: contract
            }
          })
        }
      };
      renter._renewContract(contact, contract, function(err) {
        expect(err).to.equal(undefined);
        done();
      });
    });
  });

  describe('#_renewContractMessage', function() {
    var options = {
      networkPrivateExtendedKey: hdKey.privateExtendedKey,
      networkIndex: 10,
      migrationPrivateKey: key
    };
    it('will create renew message', function() {
      var renter = complex.createRenter(options);
      var contact = new storj.Contact({
        address: '127.0.0.1',
        port: 1000
      });
      renter.network = {
        contact: contact
      };
      var contract = new storj.Contract();
      contract.set('renter_id', nodeID);
      var updatedContract = new storj.Contract();
      var msg = renter._renewContractMessage(contract, updatedContract);
      expect(msg).to.be.instanceOf(kad.Message);
      expect(msg.method).to.equal('RENEW');
      expect(msg.params.renter_id).to.equal(nodeID);
      expect(msg.params.renter_signature).to.be.a('string');
      expect(msg.params.contract).to.deep.equal(updatedContract.toObject());
      expect(msg.params.contact).to.deep.equal(contact);
      var signedContract = new storj.Contract(msg.params.contract);
      var signature = msg.params.renter_signature;
      var valid = signedContract.verifyExternal(signature, migID);
      expect(valid).to.equal(true);
    });
  });

  describe('#_validRenewedContract', function() {
    var options = {
      networkPrivateExtendedKey: hdKey.privateExtendedKey,
      networkIndex: 10,
      migrationPrivateKey: key
    };
    it('return false if contracts are different except for sig', function() {
      var renter = complex.createRenter(options);
      var before = new storj.Contract();
      var id = '028fa8eeb6f3c3d9c0746da43164834e7df08bc6';
      before.set('farmer_id', id);
      var after = new storj.Contract(before.toObject());
      var id2 = '4f31eb367dbf83f39c92d09e5a51a8fa19efe1d6';
      after.set('farmed_id', id2);
      expect(renter._validRenewedContract(before, after)).to.equal(false);
    });
    it('return false with bad signature', function() {
      var renter = complex.createRenter(options);
      var before = new storj.Contract();
      var key = new storj.KeyPair();
      var key2 = new storj.KeyPair();
      before.set('farmer_id', key.getNodeID());
      var after = new storj.Contract(before.toObject());
      after.sign('farmer', key2.getPrivateKey());
      expect(renter._validRenewedContract(before, after)).to.equal(false);
    });
    it('return true with good signature', function() {
      var renter = complex.createRenter(options);
      var before = new storj.Contract();
      var key = new storj.KeyPair();
      before.set('farmer_id', key.getNodeID());
      var after = new storj.Contract(before.toObject());
      after.sign('farmer', key.getPrivateKey());
      expect(renter._validRenewedContract(before, after)).to.equal(true);
    });
  });

  describe('#_saveRenewedContract', function() {
    var options = {
      networkPrivateExtendedKey: hdKey.privateExtendedKey,
      networkIndex: 10,
      migrationPrivateKey: key
    };
    it('will handle error from storage manager', function() {
      var renter = complex.createRenter(options);
      var contract = new storj.Contract();
      renter.network = {
        storageManager: {
          load: sinon.stub().callsArgWith(1, new Error('test'))
        }
      };
      renter._saveRenewedContract(contract, function(err) {
        expect(err).to.be.instanceOf(Error);
        expect(err.message).to.equal('test');
      });
    });
    it('will save updated storage item', function() {
      var renter = complex.createRenter(options);
      var contract = new storj.Contract();
      contract.set('farmer_id', '0d172aae0b9468103401c88d2491415a659a0f9c');
      var item = {
        removeContract: sinon.stub(),
        addContract: sinon.stub()
      };
      renter.network = {
        storageManager: {
          load: sinon.stub().callsArgWith(1, null, item),
          save: sinon.stub().callsArg(1)
        }
      };
      renter._saveRenewedContract(contract, function(err) {
        expect(err).to.equal(undefined);
        expect(item.removeContract.callCount).to.equal(1);
        expect(item.removeContract.args[0][0]).to.deep.equal({
          nodeID: '0d172aae0b9468103401c88d2491415a659a0f9c'
        });
        expect(item.addContract.callCount).to.equal(1);
        expect(item.addContract.args[0][0]).to.deep.equal({
          nodeID: '0d172aae0b9468103401c88d2491415a659a0f9c'
        });
        expect(item.addContract.args[0][1]).to.equal(contract);
      });
    });
  });

  describe('#_getStorageOffers', function() {
    var sandbox = sinon.sandbox.create();
    var options = {
      networkPrivateExtendedKey: hdKey.privateExtendedKey,
      networkIndex: 10
    };

    it('will handle error from stream', function(done) {
      var renter = complex.createRenter(options);
      renter._logger = {
        error: sinon.stub()
      };
      var contract = {
        get: sinon.stub()
      };
      var blacklist = [];
      var offerStream = new ReadableStream();
      renter.network = {
        getOfferStream: sinon.stub().returns(offerStream)
      };
      renter._signStorageContract = sinon.stub();
      renter._getStorageOffers(contract, blacklist);
      offerStream.emit('error', new Error('test'));
      expect(renter._logger.error.callCount).to.equal(1);
      done();
    });

    it('will handle offer stream end', function(done) {
      var renter = complex.createRenter(options);
      renter._logger = {
        info: sinon.stub()
      };
      var contract = {
        get: sinon.stub()
      };
      var blacklist = [];
      var offerStream = new ReadableStream();
      renter.network = {
        getOfferStream: sinon.stub().returns(offerStream)
      };
      renter._signStorageContract = sinon.stub();
      renter._getStorageOffers(contract, blacklist);
      offerStream.emit('end');
      expect(renter._logger.info.callCount).to.equal(1);
      done();
    });

    it('will handle first data event from stream', function(done) {
      var renter = complex.createRenter(options);
      renter._logger = {
        info: sinon.stub()
      };
      var contact = {};
      var contract = {
        get: sinon.stub()
      };
      var blacklist = [];
      var offerStream = new ReadableStream();
      var item = {
        addContract: sinon.stub()
      };
      renter.network = {
        getOfferStream: sinon.stub().returns(offerStream),
        storageManager: {
          load: sinon.stub().callsArgWith(1, null, item),
          save: sinon.stub().callsArg(1)
        }
      };
      renter._signStorageContract = sinon.stub();
      renter._getStorageOffers(contract, blacklist, function(err,
                                                             contact2,
                                                             contract2) {
        expect(contact2).to.equal(contact);
        expect(contract2).to.equal(contract);
        done();
      });
      var offer = {
        contact: contact,
        contract: contract
      };
      offerStream.emit('data', offer);
    });

    it('will handle error from storage load', function(done) {
      var renter = complex.createRenter(options);
      renter._logger = {
        info: sinon.stub()
      };
      var contact = {};
      var contract = {
        get: sinon.stub()
      };
      var blacklist = [];
      var offerStream = new ReadableStream();
      var item = {
        addContract: sinon.stub()
      };
      sandbox.stub(storj, 'StorageItem').returns(item);
      renter.network = {
        getOfferStream: sinon.stub().returns(offerStream),
        storageManager: {
          load: sinon.stub().callsArgWith(1, new Error('test')),
          save: sinon.stub().callsArg(1)
        }
      };
      renter._signStorageContract = sinon.stub();
      renter._getStorageOffers(contract, blacklist, function(err,
                                                             contact2,
                                                             contract2) {
        expect(contact2).to.equal(contact);
        expect(contract2).to.equal(contract);
        done();
      });
      var offer = {
        contact: contact,
        contract: contract
      };
      offerStream.emit('data', offer);
    });

    it('will handle error from storage save', function(done) {
      var renter = complex.createRenter(options);
      renter._logger = {
        info: sinon.stub()
      };
      var contact = {};
      var contract = {
        get: sinon.stub()
      };
      var blacklist = [];
      var offerStream = new ReadableStream();
      var item = {
        addContract: sinon.stub()
      };
      renter.network = {
        getOfferStream: sinon.stub().returns(offerStream),
        storageManager: {
          load: sinon.stub().callsArgWith(1, null, item),
          save: sinon.stub().callsArgWith(1, new Error('test'))
        }
      };
      renter._signStorageContract = sinon.stub();
      renter._getStorageOffers(contract, blacklist, function(err) {
        expect(err).to.be.instanceOf(Error);
        expect(err.message).to.equal('test');
        done();
      });
      var offer = {
        contact: contact,
        contract: contract
      };
      offerStream.emit('data', offer);
    });

    it('should save additional data as mirror offers', function(done) {
      /* jshint maxstatements: 50 */
      var renter = complex.createRenter(options);
      renter._logger = {
        info: sinon.stub()
      };
      var contact = {};
      var contract = {
        get: sinon.stub(),
        toObject: sinon.stub().returns('contract object')
      };
      var blacklist = [];
      var offerStream = new ReadableStream();
      var item = {
        addContract: sinon.stub()
      };
      renter.storage = {
        models: {
          Mirror: {
            create: sinon.stub().callsArg(2)
          }
        }
      };
      renter.network = {
        getOfferStream: sinon.stub().returns(offerStream),
        storageManager: {
          load: sinon.stub().callsArgWith(1, null, item),
          save: sinon.stub().callsArg(1)
        }
      };
      renter._signStorageContract = sinon.stub();
      renter._getStorageOffers(
        contract,
        blacklist,
        function(err, contact2, contract2) {
          expect(contact2).to.equal(contact);
          expect(contract2).to.equal(contract);
        }
      );
      expect(renter._signStorageContract.callCount).to.equal(1);
      expect(renter._signStorageContract.args[0][0]).to.equal(contract);
      expect(renter.network.getOfferStream.callCount).to.equal(1);
      expect(renter.network.getOfferStream.args[0][0]).to.equal(contract);
      expect(renter.network.getOfferStream.args[0][1]).to.deep.equal({
        maxOffers: 24,
        farmerBlacklist: blacklist
      });
      var offer0 = {
        contact: contact,
        contract: contract
      };
      var offer1 = {
        contact: contact,
        contract: contract
      };
      var offer2 = {
        contact: contact,
        contract: contract
      };
      offerStream.resume = sinon.stub();
      offerStream.pause = sinon.stub();
      offerStream.emit('data', offer0);
      offerStream.emit('data', offer1);
      offerStream.emit('data', offer2);
      expect(renter.storage.models.Mirror.create.callCount).to.equal(2);
      expect(offerStream.pause.callCount).to.equal(3);
      expect(offerStream.resume.callCount).to.equal(3);
      expect(contract.toObject.callCount).to.equal(2);
      var create = renter.storage.models.Mirror.create;
      expect(create.callCount).to.equal(2);
      expect(create.args[0][0]).to.equal('contract object');
      expect(create.args[1][0]).to.equal('contract object');
      expect(create.args[0][1]).to.equal(contact);
      expect(create.args[1][1]).to.equal(contact);
      expect(item.addContract.callCount).to.equal(1);
      expect(item.addContract.args[0][0]).to.equal(contact);
      expect(item.addContract.args[0][1]).to.equal(contract);
      done();
    });

    it('will handle error from storing mirrors', function(done) {
      /* jshint maxstatements: 50 */
      var renter = complex.createRenter(options);
      renter._logger = {
        info: sinon.stub(),
        warn: sinon.stub()
      };
      var contact = {};
      var contract = {
        get: sinon.stub(),
        toObject: sinon.stub().returns('contract object')
      };
      var blacklist = [];
      var offerStream = new ReadableStream();
      var item = {
        addContract: sinon.stub()
      };
      renter.storage = {
        models: {
          Mirror: {
            create: sinon.stub().callsArgWith(2, new Error('test'))
          }
        }
      };
      renter.network = {
        getOfferStream: sinon.stub().returns(offerStream),
        storageManager: {
          load: sinon.stub().callsArgWith(1, null, item),
          save: sinon.stub().callsArg(1)
        }
      };
      renter._signStorageContract = sinon.stub();
      renter._getStorageOffers(
        contract,
        blacklist,
        function(err, contact2, contract2) {
          expect(contact2).to.equal(contact);
          expect(contract2).to.equal(contract);
        }
      );
      var offer0 = {
        contact: contact,
        contract: contract
      };
      var offer1 = {
        contact: contact,
        contract: contract
      };

      offerStream.resume = sinon.stub();
      offerStream.pause = sinon.stub();
      offerStream.emit('data', offer0);
      offerStream.emit('data', offer1);

      expect(renter._logger.warn.callCount).to.equal(1);

      done();
    });

  });

});
