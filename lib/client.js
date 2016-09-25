'use strict';

var request = require('request');
var assert = require('assert');
var storj = require('storj-lib');

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
  request.post(this._opts.rpcUrl, {
    id: uuid.v4(),
    method: method,
    params: this._serializeRequestArguments(method, args)
  }, function(err, body) {
    if (err) {
      return callback(err);
    }

    if (body.error) {
      return callback(new Error(body.error.message));
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

};

/**
 * Converts storj-lib objects into request params
 * @param {String} method
 * @param {Array} arguments
 * @returns {Array}
 */
Client.prototype._serializeRequestArguments = function(method, args) {

};

/**
 * @see http://storj.github.io/core/RenterInterface.html#getConsignmentPointer__anchor
 */
Client.prototype.getConsignmentPointer = function(farmer, contract, audit, callback) {
  this._send('getConsignmentPointer', [farmer, contract, audit], callback);
};

/**
 * @see http://storj.github.io/core/RenterInterface.html#getRetrievalPointer__anchor
 */
Client.prototype.getRetrievalPointer = function(farmer, contract, callback) {
  this._send('getRetrievalPointer', [farmer, contract], callback);
};

/**
 * @see http://storj.github.io/core/RenterInterface.html#getMirrorNodes__anchor
 */
Client.prototype.getMirrorNodes = function(sources, destinations, callback) {
  this._send('getMirrorNodes', [sources, destinations], callback);
};

/**
 * @see http://storj.github.io/core/RenterInterface.html#getStorageOffer__anchor
 */
Client.prototype.getStorageOffer = function(contract, blacklist, callback) {
  this._send('getStorageOffer', [farmer, blacklist || []], callback);
};

/**
 * @see http://storj.github.io/core/RenterInterface.html#getStorageProof__anchor
 */
Client.prototype.getStorageProof = function(farmer, item, callback) {
  this._send('getStorageProof', [farmer, item], callback)
};

module.exports = Client;
