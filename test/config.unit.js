'use strict';

var fs = require('fs');
var sinon = require('sinon');
var expect = require('chai').expect;
var HDKey = require('hdkey');
var complex = require('..');
var BaseConfig = require('../lib/config').BaseConfig;
var RenterConfig = require('../lib/config').RenterConfig;
var LandlordConfig = require('../lib/config').LandlordConfig;

var seed = 'a0c42a9c3ac6abf2ba6a9946ae83af18f51bf1c9fa7dacc4c92513cc4dd015834' +
    '341c775dcd4c0fac73547c5662d81a9e9361a0aac604a73a321bd9103bce8af';
var masterKey = HDKey.fromMasterSeed(new Buffer(seed, 'hex'));
var xpriv = 'xprv9xJ62Jwpr14Bbz63pamJV4Z3qT67JfqddRW55LR2bUQ38jty7G2TSVkE5Ro8' +
    'yYZjrJGVhN8Z3qvmM9XWgGvyceNMUj7xozR4LZS1eEFP5W3';
var hdKey = masterKey.derive('m/3000\'/0\'');

describe('Base Config', function() {
  var sandbox = sinon.sandbox.create();
  afterEach(function() {
    sandbox.restore();
  });

  it('will construct with/without new', function() {
    var opts = {
      logLevel: 4,
      amqpUrl: 'amqp://localhost',
      amqpOpts: {},
    };
    var config = new BaseConfig(opts);
    expect(config).to.be.instanceOf(BaseConfig);
    var config2 = BaseConfig(opts);
    expect(config2).to.be.instanceOf(BaseConfig);
  });


  it('will parse an array of configs', function() {
    var config = [
      {
        type: 'Landlord',
        opts: {
          logLevel: 3,
          amqpUrl: 'amqp://localhost',
          amqpOpts: {},
          mongoUrl: 'mongodb://localhost:27017/storj-test',
          mongoOpts: {},
          serverPort: 8080,
          serverOpts: {
            certificate: null,
            key: null,
            authorization: {
              username: 'user',
              password: 'pass'
            }
          }
        }
      },
      {
        type: 'Renter',
        opts: {
          logLevel: 3,
          amqpUrl: 'amqp://localhost',
          amqpOpts: {},
          mongoUrl: 'mongodb://localhost:27017/storj-test',
          mongoOpts: {},
          networkPrivateExtendedKey: '/tmp/storj-complex/hd-private.key',
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
      }
    ];

    var readFileSync = sandbox.stub(fs, 'readFileSync');
    readFileSync.onFirstCall().returns(JSON.stringify(config));
    readFileSync.onSecondCall().returns(xpriv);
    readFileSync.onThirdCall().returns(new Buffer('key'));
    var conf = complex.createConfig('/tmp/somepath.json');
    expect(conf[0]).to.be.instanceOf(LandlordConfig);
    expect(conf[1]).to.be.instanceOf(RenterConfig);
  });

  it('will throw with invalid type', function() {
    var config = [
      {
        type: 'Unknown',
        opts: {}
      }
    ];

    var readFileSync = sandbox.stub(fs, 'readFileSync');
    readFileSync.onFirstCall().returns(JSON.stringify(config));
    expect(function() {
      complex.createConfig('/tmp/somepath.json');
    }).to.throw('Invalid type supplied');
  });

});

describe('Renter Config', function() {
  var sandbox = sinon.sandbox.create();
  afterEach(function() {
    sandbox.restore();
  });

  it('will construct with/without new', function() {
    var opts = {
      logLevel: 4,
      amqpUrl: 'amqp://localhost',
      amqpOpts: {},
      mongoUrl: 'mongodb://localhost:27017/storj-test',
      mongoOpts: {},
      networkPrivateExtendedKey: hdKey.privateExtendedKey,
      networkIndex: 1,
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
    };
    var config = new RenterConfig(opts);
    expect(config).to.be.instanceOf(RenterConfig);
    var config2 = RenterConfig(opts);
    expect(config2).to.be.instanceOf(RenterConfig);
  });

  it('will create config with migration and extended key', function() {
    var config = {
      type: 'Renter',
      opts: {
        logLevel: 3,
        amqpUrl: 'amqp://localhost',
        amqpOpts: {},
        mongoUrl: 'mongodb://localhost:27017/storj-test',
        mongoOpts: {},
        networkPrivateExtendedKey: '/tmp/storj-complex/hd-private.key',
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
    var readFileSync = sandbox.stub(fs, 'readFileSync');
    readFileSync.onFirstCall().returns(JSON.stringify(config));
    readFileSync.onSecondCall().returns(xpriv);
    readFileSync.onThirdCall().returns(new Buffer('key'));
    var conf = complex.createConfig('/tmp/somepath.json');
    expect(conf._.migrationPrivateKey).to.equal('key');
    expect(conf._.networkPrivateExtendedKey).to.equal(xpriv);
  });

  it('will create config with extended private key', function() {
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
    var readFileSync = sandbox.stub(fs, 'readFileSync');
    readFileSync.onFirstCall().returns(JSON.stringify(config));
    readFileSync.onSecondCall().returns(hdKey.privateExtendedKey);
    var conf = complex.createConfig('/tmp/somepath.json');
    expect(conf._.networkPrivateExtendedKey).to.equal(xpriv);
    expect(conf._.networkIndex).to.equal(10);
  });

});

describe('Landlord Config', function() {
  var sandbox = sinon.sandbox.create();
  afterEach(function() {
    sandbox.restore();
  });

  it('will construct with/without new', function() {
    var opts = {
      logLevel: 4,
      amqpUrl: 'amqp://localhost',
      amqpOpts: {},
      serverPort: 3030,
      serverOpts: {},
      mongoUrl: 'mongodb://localhost:27017/storj-test',
      mongoOpts: {},
    };
    var config = new LandlordConfig(opts);
    expect(config).to.be.instanceOf(LandlordConfig);
    var config2 = LandlordConfig(opts);
    expect(config2).to.be.instanceOf(LandlordConfig);
  });

  it('will create landlord with certificate', function() {
    var config = {
      type: 'Landlord',
      opts: {
        logLevel: 3,
        amqpUrl: 'amqp://localhost',
        amqpOpts: {},
        mongoUrl: 'mongodb://localhost:27017/storj-test',
        mongoOpts: {},
        serverPort: 8080,
        serverOpts: {
          certificate: '/tmp/certificate.pem',
          key: '/tmp/key.pem',
          authorization: {
            username: 'user',
            password: 'pass'
          }
        }
      }
    };

    var readFileSync = sandbox.stub(fs, 'readFileSync');
    readFileSync.onFirstCall().returns(JSON.stringify(config));
    readFileSync.onSecondCall().returns('pem');
    readFileSync.onThirdCall().returns('pem');
    var conf = complex.createConfig('/tmp/somepath.json');
    expect(conf._.serverOpts.certificate).to.equal('pem');
    expect(conf._.serverOpts.key).to.equal('pem');
    expect(conf._.mongoUrl).to.equal('mongodb://localhost:27017/storj-test');
    expect(conf._.mongoOpts).to.eql({});
  });

});
