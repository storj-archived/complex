'use strict';

var request = require('request');
var sinon = require('sinon');
var uuid = require('node-uuid');
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

  });

  describe('#_deserializeResponseArguments', function() {
    it('getConnectedContacts', function() {
    });

    it('getStorageOffer', function() {
    });

    it('getStorageProof', function() {
    });

    it('getConsignmentPointer', function() {
    });

    it('getRetrievalPointer', function() {
    });

    it('getMirrorNodes', function() {
    });
  });

  describe('#_serializeRequestArguments', function() {
    it('getConnectedContacts', function() {
    });

    it('getStorageOffer', function() {
    });

    it('getStorageProof', function() {
    });

    it('getConsignmentPointer', function() {
    });

    it('getRetrievalPointer', function() {
    });

    it('getMirrorNodes', function() {
    });
  });

  describe('#getConnectContacts', function() {
    it('will call send with the correct args', function() {
    });
  });

  describe('#getConsignmentPointer', function() {
    it('should call send with correct args', function() {
    });
  });

  describe('#getRetrievalPointer', function() {
    it('should call send with collect args', function() {
    });
  });

  describe('#getMirrorNodes', function() {
    it('should call send with collect arguments', function() {
    });
  });

  describe('#getStorageOffer', function() {
    it('should call send with collect params', function() {
    });

    it('should call send without blacklist param', function() {
    });
  });

  describe('#getStorageProof', function() {
    it('should call send with correct params', function() {
    });
  });

});
