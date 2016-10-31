'use strict';

var fs = require('fs');
var ReadableStream = require('stream').Readable;
var sinon = require('sinon');
var expect = require('chai').expect;
var HDKey = require('hdkey');
var complex = require('..');

var seed = 'a0c42a9c3ac6abf2ba6a9946ae83af18f51bf1c9fa7dacc4c92513cc4dd015834' +
    '341c775dcd4c0fac73547c5662d81a9e9361a0aac604a73a321bd9103bce8af';
var key = '08d1015861dd2c09ab36e97a8ecdbae26f20baabede6d618f6fb62904522c7fa';
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

  describe('#_initPrivateKey', function() {

  });

  describe('#start', function() {

  });

  describe('_loadKnownSeeds', function() {

  });

  describe('_initMessageBus', function() {

  });

  describe('_onContactAdded', function() {

  });

  describe('#_handleNetworkEvents', function() {

  });

  describe('#_handleWork', function() {

  });

  describe('#_desializeArguments', function() {
  });

  describe('#_serializeArguments', function() {

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

  describe('#_renewContract', function() {

  });

  describe('#_getStorageOffers', function() {
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
        maxOffers: 12,
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
  });

});
