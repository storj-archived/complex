'use strict';
/* jshint maxstatements: 100 */

var fs = require('fs');
var storj = require('storj-lib');
var kad = storj.deps.kad;
var ReadableStream = require('stream').Readable;
var sinon = require('sinon');
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

  describe('#_getRetrievalPointer', function() {
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
