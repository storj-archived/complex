'use strict';

/* jshint maxstatements:false */

var storj = require('storj-lib');
var request = require('request');
var sinon = require('sinon');
var uuid = require('uuid');
var expect = require('chai').expect;
var complex = require('..');
var Client = require('../lib/client');

describe('Client', function() {

  describe('@constructor', function() {

    it('will create instance with/without new', function() {
      var client = complex.createClient();
      var client2 = complex.createClient();
      expect(client._opts).to.deep.equal(Client.DEFAULTS);
      expect(client2._opts).to.deep.equal(Client.DEFAULTS);
    });

    it('will create instance and merge options', function() {
      var client = complex.createClient({hello: 'world'});
      expect(client._opts.hello).to.equal('world');
      for(var key in Client.DEFAULTS) {
        expect(client._opts[key]).to.equal(Client.DEFAULTS[key]);
      }
    });

  });

  describe('#_send', function() {
    var sandbox = sinon.sandbox.create();
    afterEach(function() {
      sandbox.restore();
    });

    it('will send correct opts to request', function(done) {
      var res = { statusCode: 200 };
      var body = { result:  ['contact'] };
      sandbox.stub(request, 'post').callsArgWith(2, null, res, body);
      sandbox.stub(uuid, 'v4').returns('445c33c0-527a-4bcc-af73-d58758d6eaa7');
      var client = complex.createClient();
      sandbox.stub(client, '_deserializeResponseArguments').returns(
        [null, ['contact']]
      );
      var args = {};
      client._send('getConnectedContacts', args, function(err, result) {
        if (err) {
          return done(err);
        }
        expect(request.post.args[0][0]).to.equal('http://localhost:8080');
        expect(request.post.args[0][1]).to.deep.equal({
          auth: {
            username: 'user',
            password: 'pass'
          },
          json: {
            id: '445c33c0-527a-4bcc-af73-d58758d6eaa7',
            method: 'getConnectedContacts',
            params: {}
          },
          timeout: 90000
        });
        expect(result).to.deep.equal(['contact']);
        done();
      });
    });

    it('will handle error from request', function(done) {
      sandbox.stub(request, 'post').callsArgWith(2, new Error('test'));
      var client = complex.createClient();
      var args = {};
      client._send('getConnectedContacts', args, function(err) {
        expect(err).to.be.instanceOf(Error);
        done();
      });
    });

    it('will give error if status code != 200', function(done) {
      var res = { statusCode: 500 };
      var body = { error: { message: 'rabbits are afk'} };
      sandbox.stub(request, 'post').callsArgWith(2, null, res, body);
      var client = complex.createClient();
      var args = {};
      client._send('getConnectedContacts', args, function(err) {
        expect(err).to.be.instanceOf(Error);
        expect(err.message).to.equal('rabbits are afk');
        done();
      });
    });

    it('status code != 200 (with error as body)', function(done) {
      var res = { statusCode: 500 };
      var body = { message: 'rabbits are afk'};
      sandbox.stub(request, 'post').callsArgWith(2, null, res, body);
      var client = complex.createClient();
      var args = {};
      client._send('getConnectedContacts', args, function(err) {
        expect(err).to.be.instanceOf(Error);
        expect(err.message).to.equal('rabbits are afk');
        done();
      });
    });

    it('status code != 200 (missing body)', function(done) {
      var res = { statusCode: 500 };
      var body = {};
      sandbox.stub(request, 'post').callsArgWith(2, null, res, body);
      var client = complex.createClient();
      var args = {};
      client._send('getConnectedContacts', args, function(err) {
        expect(err).to.be.instanceOf(Error);
        expect(err.message).to.equal('Failed to complete work, reason unknown');
        done();
      });
    });

  });

  describe('#_deserializeResponseArguments', function() {
    it('getStorageOffer', function() {
      var client = complex.createClient();
      var method = 'getStorageOffer';
      var args = [
        null,
        {
          address: '127.0.0.1',
          port: 3030
        },
        {
          data_hash: 'fc575f895a3f26f5772b9c10b0495a0fce75b4df'
        }
      ];
      var result = client._deserializeResponseArguments(method, args);
      expect(result[1]).to.be.instanceOf(storj.Contact);
      expect(result[1].address).to.equal('127.0.0.1');
      expect(result[1].port).to.equal(3030);
      expect(result[2]).to.be.instanceOf(storj.Contract);
      expect(result[2].get('data_hash'))
        .to.equal('fc575f895a3f26f5772b9c10b0495a0fce75b4df');
    });

    it('getStorageProof', function() {
      var client = complex.createClient();
      var method = 'getStorageProof';
      var args = [];
      var result = client._deserializeResponseArguments(method, args);
      expect(result).to.equal(args);
    });

    it('getConsignmentPointer', function() {
      var client = complex.createClient();
      var method = 'getConsignmentPointer';
      var args = [
        null,
        {
          farmer: {
            address: '127.0.0.1',
            port: 3000
          },
          hash: 'fad8d3a30b5d40dae9e61f7f84bf9017e9f4bb2f',
          token: '02d8b561ac9297cf2d67fe5d8fe673305e84e40a',
          operation: 'PULL'
        }
      ];
      var result = client._deserializeResponseArguments(method, args);
      expect(result[1].farmer.address).to.equal('127.0.0.1');
      expect(result[1].farmer.port).to.equal(3000);
      expect(result[1].hash).to.equal(
        'fad8d3a30b5d40dae9e61f7f84bf9017e9f4bb2f'
      );
      expect(result[1].token).to.equal(
        '02d8b561ac9297cf2d67fe5d8fe673305e84e40a'
      );
      expect(result[1].operation).to.equal('PULL');
    });

    it('getRetrievalPointer', function() {
      var client = complex.createClient();
      var method = 'getRetrievalPointer';
      var args = [
        null,
        {
          farmer: {
            address: '127.0.0.1',
            port: 3000
          },
          hash: 'fad8d3a30b5d40dae9e61f7f84bf9017e9f4bb2f',
          token: '02d8b561ac9297cf2d67fe5d8fe673305e84e40a',
          operation: 'PUSH'
        }
      ];
      var result = client._deserializeResponseArguments(method, args);
      expect(result[1].farmer.address).to.equal('127.0.0.1');
      expect(result[1].farmer.port).to.equal(3000);
      expect(result[1].hash).to.equal(
        'fad8d3a30b5d40dae9e61f7f84bf9017e9f4bb2f'
      );
      expect(result[1].token).to.equal(
        '02d8b561ac9297cf2d67fe5d8fe673305e84e40a'
      );
      expect(result[1].operation).to.equal('PUSH');
    });

    it('getMirrorNodes', function() {
      var client = complex.createClient();
      var method = 'getMirrorNodes';
      var args = [
        null,
        [
          {
            address: '127.0.0.1',
            port: 3030
          }
        ]
      ];
      var result = client._deserializeResponseArguments(method, args);
      expect(Array.isArray(result[1])).to.equal(true);
      expect(result[1][0]).to.be.instanceOf(storj.Contact);
    });

    it('unknownMethod', function() {
      var client = complex.createClient();
      var method = 'unknownMethod';
      var args = [];
      var result = client._deserializeResponseArguments(method, args);
      expect(result).to.equal(args);
    });
  });

  describe('#_serializeRequestArguments', function() {
    it('getStorageOffer', function() {
      var client = complex.createClient();
      var method = 'getStorageOffer';
      var contract = new storj.Contract();
      var blacklist = ['34ae378e608b2f2a3c36826264e3b7190be3e608'];
      var args = [contract, blacklist];
      var result = client._serializeRequestArguments(method, args);
      expect(result).to.deep.equal([
        {
          audit_count: 10,
          data_hash: null,
          data_size: 1234,
          farmer_id: null,
          farmer_signature: null,
          payment_destination: null,
          payment_download_price: 0,
          payment_storage_price: 0,
          renter_hd_index: false,
          renter_hd_key: false,
          renter_id: null,
          renter_signature: null,
          store_begin: 2000000000,
          store_end: 3000000000,
          version: 0
        },
        ['34ae378e608b2f2a3c36826264e3b7190be3e608']
      ]);
    });

    it('getStorageProof', function() {
      var client = complex.createClient();
      var method = 'getStorageProof';
      var farmer = new storj.Contact({
        address: '127.0.0.1',
        port: 3030
      });
      var item = new storj.StorageItem({});
      var args = [farmer, item];
      var result = client._serializeRequestArguments(method, args);
      expect(result).to.equal(args);
    });

    it('getConsignmentPointer', function() {
      var client = complex.createClient();
      var method = 'getConsignmentPointer';
      var farmer = new storj.Contact({
        address: '127.0.0.1',
        port: 3030
      });
      var contract = new storj.Contract({});
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
      var audit = storj.AuditStream.fromRecords(challenges, tree);
      var args = [
        farmer,
        contract,
        audit
      ];
      var result = client._serializeRequestArguments(method, args);
      expect(result[0].lastSeen).to.be.a('number');
      expect(result[0].userAgent).to.be.a('string');
      delete result[0].lastSeen;
      delete result[0].userAgent;
      expect(JSON.parse(JSON.stringify(result[0]))).to.deep.equal({
        protocol: '1.0.0',
        address: '127.0.0.1',
        port: 3030,
        nodeID: 'a978efc9158dece8b6d34f605314b5dc8e003aaa',
      });
      expect(result[1]).to.deep.equal({
        audit_count: 10,
        data_hash: null,
        data_size: 1234,
        farmer_id: null,
        farmer_signature: null,
        payment_destination: null,
        payment_download_price: 0,
        payment_storage_price: 0,
        renter_hd_index: false,
        renter_hd_key: false,
        renter_id: null,
        renter_signature: null,
        store_begin: 2000000000,
        store_end: 3000000000,
        version: 0
      });
      expect(result[2]).to.deep.equal({
        challenges: challenges,
        tree: tree
      });
    });

    it('getRetrievalPointer', function() {
      var client = complex.createClient();
      var method = 'getRetrievalPointer';
      var contact = storj.Contact({
        address: '127.0.0.1',
        port: 3030
      });
      var contract = storj.Contract({});
      var args = [
        contact,
        contract
      ];
      var result = client._serializeRequestArguments(method, args);
      expect(result[0].lastSeen).to.be.a('number');
      expect(result[0].userAgent).to.be.a('string');
      delete result[0].lastSeen;
      delete result[0].userAgent;
      expect(JSON.parse(JSON.stringify(result[0]))).to.deep.equal({
        protocol: '1.0.0',
        address: '127.0.0.1',
        port: 3030,
        nodeID: 'a978efc9158dece8b6d34f605314b5dc8e003aaa'
      });
      expect(result[1]).to.deep.equal({
        audit_count: 10,
        data_hash: null,
        data_size: 1234,
        farmer_id: null,
        farmer_signature: null,
        payment_destination: null,
        payment_download_price: 0,
        payment_storage_price: 0,
        renter_hd_index: false,
        renter_hd_key: false,
        renter_id: null,
        renter_signature: null,
        store_begin: 2000000000,
        store_end: 3000000000,
        version: 0
      });
    });

    it('getMirrorNodes', function() {
      var client = complex.createClient();
      var method = 'getMirrorNodes';
      var args = [];
      client._serializeRequestArguments(method, args);
    });
  });

  describe('#getConsignmentPointer', function() {
    it('should call send with correct args', function(done) {
      var client = complex.createClient();
      client._send = sinon.stub().callsArg(2);
      var f = new storj.Contact({
        address: '127.0.0.1',
        port: 3030
      });
      var c = new storj.Contract({});
      var a = new storj.AuditStream(2);
      client.getConsignmentPointer(f, c, a, function() {
        expect(client._send.callCount).to.equal(1);
        expect(client._send.args[0][0]).to.equal('getConsignmentPointer');
        expect(client._send.args[0][1]).to.deep.equal([f, c, a]);
        done();
      });
    });
  });

  describe('#getRetrievalPointer', function() {
    it('should call send with correct args', function(done) {
      var client = complex.createClient();
      client._send = sinon.stub().callsArg(2);
      var farmer = new storj.Contact({
        address: '127.0.0.1',
        port: 3030
      });
      var contract = new storj.Contract({});
      client.getRetrievalPointer(farmer, contract, function() {
        expect(client._send.callCount).to.equal(1);
        expect(client._send.args[0][0]).to.equal('getRetrievalPointer');
        expect(client._send.args[0][1]).to.deep.equal([
          farmer,
          contract
        ]);
        done();
      });
    });
  });

  describe('#getMirrorNodes', function() {
    it('should call send with correct arguments', function(done) {
      var client = complex.createClient();
      client._send = sinon.stub().callsArg(2);
      var sources = [
        {
          farmer: storj.Contact({
            address: '127.0.0.1',
            port: 3000
          }),
          hash: 'fad8d3a30b5d40dae9e61f7f84bf9017e9f4bb2f',
          token: '02d8b561ac9297cf2d67fe5d8fe673305e84e40a',
          operation: 'PULL'
        }
      ];
      var destinations = [
        new storj.Contact({
          address: '127.0.0.1',
          port: 3030
        })
      ];
      client.getMirrorNodes(sources, destinations, function() {
        expect(client._send.callCount).to.equal(1);
        expect(client._send.args[0][0]).to.equal('getMirrorNodes');
        expect(client._send.args[0][1]).to.deep.equal([
          sources,
          destinations
        ]);
        done();
      });
    });
  });

  describe('#getStorageOffer', function() {
    it('should call send with correct params', function(done) {
      var client = complex.createClient();
      client._send = sinon.stub().callsArg(2);
      var contract = new storj.Contract();
      var blacklist = [];
      client.getStorageOffer(contract, blacklist, function() {
        expect(client._send.callCount).to.equal(1);
        expect(client._send.args[0][0]).to.equal('getStorageOffer');
        expect(client._send.args[0][1]).to.deep.equal([
          contract,
          blacklist
        ]);
        done();
      });
    });

    it('should call send without blacklist param', function(done) {
      var client = complex.createClient();
      client._send = sinon.stub().callsArg(2);
      var contract = new storj.Contract();
      client.getStorageOffer(contract, function() {
        expect(client._send.callCount).to.equal(1);
        expect(client._send.args[0][0]).to.equal('getStorageOffer');
        expect(client._send.args[0][1]).to.deep.equal([
          contract,
          []
        ]);
        done();
      });
    });
  });

  describe('#getStorageProof', function() {
    it('should call send with correct params', function(done) {
      var client = complex.createClient();
      client._send = sinon.stub().callsArg(2);
      var farmer = storj.Contact({
        address: '127.0.0.1',
        port: 3030
      });
      var item = storj.StorageItem({});
      client.getStorageProof(farmer, item, function() {
        expect(client._send.callCount).to.equal(1);
        expect(client._send.args[0][0]).to.equal('getStorageProof');
        expect(client._send.args[0][1]).to.deep.equal([
          farmer,
          item
        ]);
        done();
      });
    });
  });

  describe('#ping', function() {
    it('should call send with correct params', function(done) {
      var client = complex.createClient();
      client._send = sinon.stub().callsArg(2);
      var farmer = storj.Contact({
        address: '127.0.0.1',
        port: 3030
      });
      client.ping(farmer, function() {
        expect(client._send.callCount).to.equal(1);
        expect(client._send.args[0][0]).to.equal('ping');
        expect(client._send.args[0][1]).to.deep.equal([
          farmer
        ]);
        done();
      });
    });
  });

});
