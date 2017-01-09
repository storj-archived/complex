'use strict';

var assert = require('assert');
var storj = require('storj-lib');
var kad = storj.deps.kad;
var MongoStorageAdapter = require('storj-mongodb-adapter');
var HDKey = require('hdkey');
var ReadableStream = require('readable-stream');
var inherits = require('util').inherits;
var rabbitmq = require('rabbit.js');
var Logger = require('kad-logger-json');
var RenterConfig = require('./config').RenterConfig;
var Storage = require('storj-service-storage-models');

/**
 * Create a renter interface capable of coordinating with other renters
 * @constructor
 * @param {Object} options
 * @param {String} options.mongoUrl - The URL for the MongoDB
 * @param {Object} options.mongoOpts - Options to pass to Mongoose
 * @param {String} options.networkPrivateExtendedKey
 * @param {Number} options.networkIndex - The index for extended key
 * @param {String} [options.migrationPrivateKey] - The private key for the
 * renter to migrate from upon new retrieval of shard
 * @param {Object} options.networkOpts - Options to pass to Renter
 * @param {String} options.amqpUrl - The URL for the RabbitMQ server
 * @param {Object} options.amqpOpts - Options to pass the RabbitMQ context
 * @param {Number} options.logLevel - The verbosity level for logging
 * @param {Number} options.totalRenters - The total number of renter in pool
 * @param {Number} options.renterOverlap - Desired queue subscription overlap
 */
function Renter(options) {
  if (!(this instanceof Renter)) {
    return new Renter(options);
  }

  this.hdKey = null;
  this.hdIndex = null;

  this._opts = options instanceof RenterConfig ?
    options.toObject() :
    options;

  this._opts = this._initPrivateKey(this._opts);

  this._logger = new Logger(this._opts.logLevel);
  this._pendingCallbacks = {};

  ReadableStream.call(this);
  this._logger.on('data', this.push.bind(this));
}

inherits(Renter, ReadableStream);

Renter.SAFE_LANDLORD_METHODS = [
  'getConsignmentPointer',
  'getRetrievalPointer',
  'getMirrorNodes',
  'getStorageOffer',
  'getStorageProof',
  'ping'
];

Renter.METHOD_MAP_REDIRECT = {
  getStorageOffer: '_getStorageOffers',
  getRetrievalPointer: '_getRetrievalPointer'
};

Renter.POOL_REQUEST_TIMEOUT = 10000;

Renter.prototype._initPrivateKey = function(options) {
  assert(options.networkPrivateExtendedKey, 'networkHDPrivateKey is expected');
  assert(storj.utils.isValidHDNodeKey(options.networkPrivateExtendedKey),
         'networkHDPrivateKey is expected to be an extended private key');
  assert(storj.utils.isValidNodeIndex(options.networkIndex),
         'networkHDIndex is expected to be non-hardened derivation index');

  if (options.migrationPrivateKey) {
    this.migrationKeyPair = new storj.KeyPair(options.migrationPrivateKey);
  }

  this.hdKey = HDKey.fromExtendedKey(options.networkPrivateExtendedKey);
  this.hdIndex = options.networkIndex;
  var child = this.hdKey.deriveChild(options.networkIndex);
  var privateKey = child.privateKey;
  assert(privateKey, 'Unable to derive privateKey');
  this.keyPair = storj.KeyPair(privateKey.toString('hex'));

  return options;
};

/**
 * @private
 */
Renter.prototype._read = storj.utils.noop;

/**
 * Initializes storage instance
 * @private
 */
Renter.prototype._initStorage = function() {
  this.storage = new Storage(
    this._opts.mongoUrl,
    this._opts.mongoOpts,
    {
      logger: this._logger
    }
  );
};

/**
 * Initializes network instance to Storj network
 * @private
 * @param {Array} seeds
 */
Renter.prototype._initNetwork = function(seeds) {

  var storageManager = new storj.StorageManager(
    new MongoStorageAdapter(this.storage)
  );

  this.network = storj.Renter({
    storageManager: storageManager,
    rpcPort: this._opts.networkOpts.rpcPort,
    rpcAddress: this._opts.networkOpts.rpcAddress,
    doNotTraverseNat: this._opts.networkOpts.doNotTraverseNat,
    maxTunnels: this._opts.networkOpts.maxTunnels,
    tunnelGatewayRange: this._opts.networkOpts.tunnelGatewayRange,
    bridgeUri: this._opts.networkOpts.bridgeUri,
    logger: this._logger,
    seedList: this._opts.networkOpts.seedList.concat(seeds),
    maxConnections: this._opts.networkOpts.maxConnections,
    hdKey: this.hdKey.privateExtendedKey,
    hdIndex: this.hdIndex
  });

  this.network.on('error', function(err) {
    this._logger.warn(err.message);
  });
};

/**
 * Starts the renter service
 * @param {Renter~startCallback}
 */
Renter.prototype.start = function(callback) {

  // Set up our database connection for shared contract storage
  this._initStorage();

  // Add our already known contacts as seeds
  this._loadKnownSeeds(function(err, seeds) {
    if (err) {
      return callback(err);
    }

    // Set up our RabbitMQ context
    this._amqpContext = rabbitmq.createContext(
      this._opts.amqpUrl,
      this._opts.amqpOpts
    );

    // Set up our network interface to Storj
    this._initNetwork(seeds);

    // When our context is good, set up our subscriptions
    this._amqpContext.on('ready', this._initMessageBus.bind(this));

    // When we are all connected, fire the callback
    this.once('ready', function() {
      this.removeAllListeners('error');
      callback();
    });

    // Otherwise bubble any errors
    this.once('error', function(err) {
      this.removeAllListeners('ready');
      callback(err);
    });

  }.bind(this));
};
/**
 * @callback Renter~startCallback
 * @param {Error} [error]
 */

/**
 * Gets the last few known contacts and uses them as seeds
 * @private
 */
Renter.prototype._loadKnownSeeds = function(callback) {
  this.storage.models.Contact.find({}).sort({
    lastSeen: -1
  }).limit(10).exec(function(err, contacts) {
    if (err) {
      return callback(err);
    }

    callback(null, contacts.map(function(c) {
      return storj.utils.getContactURL(c);
    }));
  });
};

/**
 * Determines the optimal span range (0 to x) based on the given desired
 * probability, total available points, and number of selections.
 *
 * The calculation uses the equation `p = 1 - Math.pow(1 - s, y)` where `s`
 * equals the span percentage of the total points (e.g. 1/128), `y` equals the
 * total number of random selections (e.g. 128), and `p` equals the probability
 * of landing in the range. This is done by determining the probability of not
 * landing in the range and then inverted to determine the positive case. The
 * equation is then used to solve for s, instead of p.
 *
 * @param {Number} t - Total number of all available points
 * @param {Number} y - Total number of random selections
 * @param {Number} p - Desired percentage of landing in span range
 * @private
 */
Renter.prototype._getQueueSpan = function(t, y, p) {
  assert(Number.isSafeInteger(t) && t > 0,
         't is expected to be integer greater than zero');
  assert(Number.isSafeInteger(y) && y > 0,
         'y is expected to be integer greater than zero');
  assert(Number.isFinite(p) && p > 0 && p < 1,
         'p is expected to be number > 0 and < 1');

  var x = (Math.pow((p - 1) / -1, 1 / y) - 1) * -t;
  return x;
};

/**
 * Calculate the offset of queues
 * @private
 */
Renter.prototype._getQueueOffset = function() {
  var overlap = this._opts.renterOverlap;
  assert(Number.isFinite(overlap), 'renterOverlap is expected to be number');

  var span = this._getQueueSpan(
    256, // total number of queues
    this._opts.totalRenters, // total number of renters in pool
    0.999 // percentage
  );

  return Math.ceil(span * overlap / 2);
};

/**
 * Initialize the rabbitmq message bus
 * @private
 */
Renter.prototype._initMessageBus = function() {
  /* jshint maxstatements:false */
  var self = this;
  var offset = this._getQueueOffset();
  var nodeId = this.network.contact.nodeID;
  var exchangeByteStart = Buffer(nodeId, 'hex')[0] - offset;
  var exchangeByteEnd = exchangeByteStart + (offset * 2);

  this.workers = {};

  for (let b = exchangeByteStart; b <= exchangeByteEnd; b++) {
    let name = 'work-x-' + Buffer([b]).toString('hex');
    let sock = this.workers[name] = this._amqpContext.socket('WORKER');
    sock.connect(name);
    sock.on('data', this._handleWork.bind(this, sock));
  }

  // Setup our amqp sockets
  this.notifier = this._amqpContext.socket('PUBLISH');
  this.notifier.connect('work.close');

  // Join the network!
  this.network.join(function(err) {
    if (err) {
      return self.emit('error', err);
    }

    // Set up our internal alerts for other renters
    self._handleNetworkEvents();
  });
};

/**
 * @private
 */
Renter.prototype._onContactAdded = function(contact) {
  this.storage.models.Contact.record(contact);
};

/**
 * Listens for network events and fires their appropriate handlers
 * @private
 */
Renter.prototype._handleNetworkEvents = function() {
  this.network.router.on('add', this._onContactAdded.bind(this));
  this.network.router.on('shift', this._onContactAdded.bind(this));

  // Good to go!
  this.emit('ready');
};

/**
 * Handles work received from a landlord
 * @private
 */
Renter.prototype._handleWork = function(sock, buffer) {
  var self = this;
  var data = JSON.parse(buffer.toString());

  // Acknowledge we have received the work
  sock.ack();
  this._logger.info('received job %s', data.id);

  if (Renter.SAFE_LANDLORD_METHODS.indexOf(data.method) === -1) {
    this._logger.warn('cannot call method %s', data.method);
    return this.notifier.write(new Buffer(JSON.stringify({
      id: data.id,
      error: {
        code: -32601,
        message: 'Method not found'
      }
    })));
  }

  data.params.push(function(err) {
    if (err) {
      return self.notifier.write(new Buffer(JSON.stringify({
        id: data.id,
        error: {
          code: -32603,
          message: err.message
        }
      })));
    }

    var argsArray = Array.prototype.slice.call(arguments);
    var args = self._serializeArguments(data.method, argsArray);

    self.notifier.write(new Buffer(JSON.stringify({
      id: data.id,
      result: args
    })));
  });

  this._logger.info('calling method: %s', data.method);

  try {
    if (Renter.METHOD_MAP_REDIRECT[data.method]) {
      this[Renter.METHOD_MAP_REDIRECT[data.method]].apply(
        this,
        this._deserializeArguments(data.method, data.params)
      );
    } else {
      this.network[data.method].apply(
        this.network,
        this._deserializeArguments(data.method, data.params)
      );
    }
  } catch (err) {
    self.notifier.write(new Buffer(JSON.stringify({
      id: data.id,
      error: {
        code: -32603,
        message: err.message
      }
    })));
  }
};

/**
 * Deserializes the arguments passed back to the bus
 * @param {String} method - The method name to call
 * @param {Array} argmuments - The arguments passed to the method
 * @returns {Array} args
 */
Renter.prototype._deserializeArguments = function(method, args) {
  /* jshint maxcomplexity:false */
  switch (method) {
    case 'getConsignmentPointer':
      args[0] = storj.Contact(args[0]);
      args[1] = storj.Contract.fromObject(args[1]);
      args[2] = storj.AuditStream.fromRecords(
        args[2].challenges,
        args[2].tree
      );
      break;
    case 'getRetrievalPointer':
      args[0] = storj.Contact(args[0]);
      args[1] = storj.Contract.fromObject(args[1]);
      break;
    case 'getMirrorNodes':
      args[1] = args[1].map(function(contactData) {
        return storj.Contact(contactData);
      });
      break;
    case 'getStorageProof':
      args[0] = storj.Contact(args[0]);
      args[1] = storj.StorageItem(args[1]);
      break;
    case 'getStorageOffer':
      args[0] = storj.Contract.fromObject(args[0]);
      args[2] = typeof args[1] === 'function' ? args[1] : args[2];
      args[1] = Array.isArray(args[1]) ? args[1] : [];
      break;
    default:
      // noop
  }

  return args;
};

/**
 * Serializes the arguments passed back to the bus
 * @param {String} method - The method name to call
 * @param {Array} argmuments - The arguments passed to the method
 * @returns {Array} args
 */
Renter.prototype._serializeArguments = function(method, args) {
  /* jshint maxcomplexity:false */
  switch (method) {
    case 'getConsignmentPointer':
      break;
    case 'getRetrievalPointer':
      break;
    case 'getMirrorNodes':
      break;
    case 'getStorageProof':
      break;
    case 'getStorageOffer':
      args[2] = args[2].toObject();
      break;
    default:
      // noop
  }

  return args;
};

Renter.prototype._signStorageContract = function(contract) {
  contract.set('renter_hd_key', this.hdKey.publicExtendedKey);
  contract.set('renter_hd_index', this.hdIndex);
  contract.set('renter_id', this.keyPair.getNodeID());
  contract.sign('renter', this.keyPair.getPrivateKey());
};

/**
 * Intercepts the getRetrievalPointer method and ensures that if we have a
 * migration key, to issue a renew rpc message to update the remote contract
 * before proceeding
 * @private
 * @param {storj.Contact} contact
 * @param {storj.Contract} contract
 * @param {Function} callback
 */
Renter.prototype._getRetrievalPointer = function(contact, contract, callback) {
  var self = this;
  var doNotRenew = !this.migrationKeyPair || contract.get('renter_hd_key');

  if (doNotRenew) {
    return this.network.getRetrievalPointer(contact, contract, callback);
  }

  this._renewContract(contact, contract, function(err) {
    if (err) {
      return callback(err);
    }

    self.network.getRetrievalPointer(contact, contract, callback);
  });
};

/**
 * Sends the renewal message to the target farmer
 * @private
 */
Renter.prototype._renewContract = function(contact, contract, callback) {
  var self = this;
  var updatedContract = new storj.Contract(contract.toObject());

  this._signStorageContract(updatedContract);

  var renewRpc = this._renewContractMessage(contract, updatedContract);

  this.network.transport.send(contact, renewRpc, function(err, message) {
    if (err) {
      return callback(err);
    }

    if (!message.result) {
      return callback(new Error(message.error.message));
    }

    var farmerContract = new storj.Contract(message.result.contract);

    if (!self._validRenewedContract(updatedContract, farmerContract)) {
      return callback(new Error('Invalid farmer contract'));
    }

    self._saveRenewedContract(farmerContract, callback);
  });
};

Renter.prototype._renewContractMessage = function(contract, updatedContract) {
  assert(this.migrationKeyPair, 'migration private key is expected');
  var msg = new kad.Message({
    method: 'RENEW',
    params: {
      renter_id: contract.get('renter_id'),
      renter_signature: updatedContract.signExternal(
        this.migrationKeyPair.getPrivateKey()
      ),
      contract: updatedContract.toObject(),
      contact: this.network.contact
    }
  });
  return msg;
};

Renter.prototype._validRenewedContract = function(before, after) {
  var diff = storj.Contract.diff(before, after);

  if (diff.length !== 1 || diff[0] !== 'farmer_signature') {
    return false;
  }

  return after.verify('farmer', after.get('farmer_id'));
};

Renter.prototype._saveRenewedContract = function(contract, callback) {
  var self = this;

  var dataHash = contract.get('data_hash');

  self.network.storageManager.load(dataHash, function(err, item) {
    if (err) {
      return callback(err);
    }

    var farmerContact = { nodeID: contract.get('farmer_id') };
    item.removeContract(farmerContact);
    item.addContract(farmerContact, contract);

    self.network.storageManager.save(item, callback);
  });
};

/**
 * Redirects RPC requests to `getStorageOffer` here, which will create an
 * offer stream, use the first offer as the response, then setup other
 * offers as potential mirrors
 * @private
 * @param {storj.Contract} contract
 * @param {Array} blacklist
 * @param {Function} callback
 */
Renter.prototype._getStorageOffers = function(contract, blacklist, callback) {
  var self = this;

  this._signStorageContract(contract);

  var hash = contract.get('data_hash');
  var offerStream = this.network.getOfferStream(contract, {
    maxOffers: 24,
    farmerBlacklist: blacklist
  });
  var didReceiveFirstOffer = false;

  function _storeAsQueuedMirror(offer) {
    self.storage.models.Mirror.create(
      offer.contract.toObject(),
      offer.contact,
      function(err) {
        if (err) {
          return self._logger.warn(
            'failed to add mirror to pool, reason: %s',
            err.message
          );
        }

        offerStream.resume();
      }
    );
  }

  function _handleOffer(offer) {
    offerStream.pause();

    if (didReceiveFirstOffer) {
      return _storeAsQueuedMirror(offer);
    }

    self.network.storageManager.load(hash, function(err, item) {
      if (err || !item) {
        item = new storj.StorageItem({ hash: hash });
      }

      item.addContract(offer.contact, offer.contract);
      self.network.storageManager.save(item, function(err) {
        if (err) {
          return callback(err);
        }

        didReceiveFirstOffer = true;

        offerStream.resume();
        callback(null, offer.contact, offer.contract);
      });
    });
  }

  function _handleEnd() {
    self._logger.info('finished handling offers for shard %s', hash);
  }

  function _handleError(err) {
    self._logger.error(
      'error occurred while processing offers for %s: %s',
      hash,
      err.message
    );
  }

  offerStream.on('data', _handleOffer);
  offerStream.on('end', _handleEnd);
  offerStream.on('error', _handleError);
};

module.exports = Renter;
