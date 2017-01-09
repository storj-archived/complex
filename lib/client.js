'use strict';

var request = require('request');
var assert = require('assert');
var storj = require('storj-lib');
var uuid = require('uuid');
var merge = require('merge');
var Landlord = require('./landlord');

/**
 * Creates a RPC client for communicating with a {@link Landlord}
 * @constructor
 * @param {Object} options
 * @param {String} options.rpcUrl - The URL of the Landlord RPC server
 * @param {String} options.rpcUser - Authorization username
 * @param {String} options.rpcPassword - Authorization password
 */
function Client(options) {
  if (!(this instanceof Client)) {
    return new Client(options);
  }

  this._opts = merge(Object.create(Client.DEFAULTS), options);
}

Client.DEFAULTS = {
  rpcUrl: 'http://localhost:8080',
  rpcUser: 'user',
  rpcPassword: 'pass'
};

/**
 * Sends the JSON-RPC message and handles the response
 * @param {String} method
 * @param {Array} args
 * @param {Function} callback
 * @private
 */
Client.prototype._send = function(method, args, callback) {
  var self = this;

  request.post(this._opts.rpcUrl, {
    auth: {
      username: this._opts.rpcUser,
      password: this._opts.rpcPassword
    },
    json: {
      id: uuid.v4(),
      method: method,
      params: this._serializeRequestArguments(method, args)
    },
    timeout: Landlord.REQUEST_TIMEOUT
  }, function(err, res, body) {
    if (err) {
      return callback(err);
    }
    if (res.statusCode !== 200) {
      if (body.error) {
        return callback(new Error(body.error.message));
      } else if (body.message) {
        return callback(new Error(body.message));
      } else {
        return callback(new Error('Failed to complete work, reason unknown'));
      }
    }
    callback.apply(
      null,
      self._deserializeResponseArguments(method, body.result)
    );
  });
};

/**
 * Converts response params into storj-lib objects
 * @param {String} method
 * @param {Array} arguments
 * @returns {Array}
 */
Client.prototype._deserializeResponseArguments = function(method, args) {
  /* jshint maxcomplexity:false */
  switch (method) {
    case 'getStorageOffer':
      args[1] = storj.Contact(args[1]);
      args[2] = storj.Contract.fromObject(args[2]);
      break;
    case 'getStorageProof':
      break;
    case 'getConsignmentPointer':
      break;
    case 'getRetrievalPointer':
      break;
    case 'getMirrorNodes':
      args[1] = args[1].map(function(c) {
        return storj.Contact(c);
      });
      break;
    default:
      // noop
  }

  return args;
};

/**
 * Converts storj-lib objects into request params
 * @param {String} method
 * @param {Array} arguments
 * @returns {Array}
 */
Client.prototype._serializeRequestArguments = function(method, args) {
  /* jshint maxcomplexity:false */
  switch (method) {
    case 'getStorageOffer':
      args[0] = args[0].toObject();
      break;
    case 'getStorageProof':
      break;
    case 'getConsignmentPointer':
      args[1] = args[1].toObject();
      args[2] = {
        challenges: args[2].getPrivateRecord().challenges,
        tree: args[2].getPublicRecord()
      };
      break;
    case 'getRetrievalPointer':
      args[1] = args[1].toObject();
      break;
    case 'getMirrorNodes':
      break;
    default:
      // noop
  }

  return args;
};

/**
 * @see http://storj.github.io/core/RenterInterface.html
 */
Client.prototype.getConsignmentPointer = function(f, c, a, callback) {
  assert(f instanceof storj.Contact, 'Invalid contact supplied');
  assert(c instanceof storj.Contract, 'Invalid contract supplied');
  assert(a instanceof storj.AuditStream, 'Invalid audit object supplied');
  this._send('getConsignmentPointer', [f, c, a], callback);
};

/**
 * @see http://storj.github.io/core/RenterInterface.html
 */
Client.prototype.getRetrievalPointer = function(farmer, contract, callback) {
  assert(farmer instanceof storj.Contact, 'Invalid contact supplied');
  assert(contract instanceof storj.Contract, 'Invalid contract supplied');
  this._send('getRetrievalPointer', [farmer, contract], callback);
};

/**
 * @see http://storj.github.io/core/RenterInterface.html
 */
Client.prototype.getMirrorNodes = function(sources, destinations, callback) {
  assert(Array.isArray(sources), 'Invalid sources supplied');
  assert(Array.isArray(destinations), 'Invalid destinations supplied');
  destinations.forEach(function(dest) {
    assert(dest instanceof storj.Contact, 'Invalid contact');
  });
  this._send('getMirrorNodes', [sources, destinations], callback);
};

/**
 * @see http://storj.github.io/core/RenterInterface.html
 */
Client.prototype.getStorageOffer = function(contract, blacklist, callback) {
  if (typeof blacklist === 'function') {
    callback = blacklist;
    blacklist = [];
  }

  assert(contract instanceof storj.Contract, 'Invalid contract supplied');
  assert(Array.isArray(blacklist), 'Invalid blacklist supplied');
  this._send('getStorageOffer', [contract, blacklist], callback);
};

/**
 * @see http://storj.github.io/core/RenterInterface.html
 */
Client.prototype.getStorageProof = function(farmer, item, callback) {
  assert(farmer instanceof storj.Contact, 'Invalid contact supplied');
  assert(item instanceof storj.StorageItem, 'Invalid storage item supplied');
  this._send('getStorageProof', [farmer, item], callback);
};

/**
 *@see http://storj.github.io/core/Network.html
 */
Client.prototype.ping = function(contact, callback) {
  assert(contact instanceof storj.Contact, 'Invalid contact supplied');
  this._send('ping', [contact], callback);
};


module.exports = Client;
