'use strict';

var sinon = require('sinon');
var expect = require('chai').expect;
var HDKey = require('hdkey');
var complex = require('..');

var seed = 'a0c42a9c3ac6abf2ba6a9946ae83af18f51bf1c9fa7dacc4c92513cc4dd015834' +
    '341c775dcd4c0fac73547c5662d81a9e9361a0aac604a73a321bd9103bce8af';
var key = '08d1015861dd2c09ab36e97a8ecdbae26f20baabede6d618f6fb62904522c7fa';
var masterKey = HDKey.fromMasterSeed(new Buffer(seed, 'hex'));
var hdKey = masterKey.derive('m/3000\'/0\'');
var pub = 'xpub6BHSRpUigNcUpUAWvcJJrCVnPUvbi8ZUzeRfsipe9ow21YE7eoLhzJ4h' +
    'vkQmEoGMeX3jpwaHp91ycGo1Z4WStsEVBmw1qq6Q3ouPm6GqA4L';
var priv = '979008b562424a0bcd29d82ca6c5c27c7b8e420e17a936752454b9650fac3cd5';
var nodeID = '4abb9b37bd4cbea611c480eb967ad96bf2e3b850';

describe('Renter', function() {

  describe('@constructor', function() {

    it('will construct new instance (with/without new)', function() {
      var options = {
        networkPrivateKey: key
      };
      var renter = complex.createRenter(options);
      var renter2 = new complex.createRenter(options);
      expect(renter).to.be.instanceOf(complex.createRenter);
      expect(renter2).to.be.instanceOf(complex.createRenter);
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

    it('will construct with private key', function() {
      var options = {
        networkPrivateKey: key
      };
      var renter = complex.createRenter(options);
      expect(renter).to.be.instanceOf(complex.createRenter);
      expect(renter.keyPair.getPrivateKey()).to.equal(key);
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

    it('will not set hd props on the contract', function() {
      var options = {
        networkPrivateKey: key
      };
      var renter = complex.createRenter(options);
      var contract = {
        set: sinon.stub(),
        sign: sinon.stub()
      };
      renter._signStorageContract(contract);
      expect(contract.set.callCount).to.equal(1);
      expect(contract.set.args[0][0]).to.equal('renter_id');
      expect(contract.sign.callCount).to.equal(1);
      expect(contract.sign.args[0][0]).to.equal('renter');
      expect(contract.sign.args[0][1]).to.equal(key);
    });


  });

});
