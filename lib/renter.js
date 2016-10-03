'use strict';

var storj = require('storj-lib');
var MongoStorageAdapter = require('storj-mongodb-adapter');
var ReadableStream = require('readable-stream');
var inherits = require('util').inherits;
var rabbitmq = require('rabbit.js');
var Logger = require('kad-logger-json');
var uuid = require('node-uuid');
var url = require('url');
var RenterConfig = require('./config').RenterConfig;
var Storage = require('storj-service-storage-models');
var merge = require('merge');

/**
 * Create a renter interface capable of coordinating with other renters
 * @constructor
 * @param {Object} options
 * @param {String} options.mongoUrl - The URL for the MongoDB
 * @param {Object} options.mongoOpts - Options to pass to Mongoose
 * @param {String} options.networkPrivateKey - The private key for the renter
 * @param {Object} options.networkOpts - Options to pass to RenterInterface
 * @param {String} options.amqpUrl - The URL for the RabbitMQ server
 * @param {Object} options.amqpOpts - Options to pass the RabbitMQ context
 * @param {Number} options.logLevel - The verbosity level for logging
 */
function Renter(options) {
  if (!(this instanceof Renter)) {
    return new Renter(options);
  }

  this._opts = options instanceof RenterConfig ?
               options.toObject() :
               options;
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
  'getStorageProof'
];

Renter.SAFE_POOL_METHODS = [
  'isAwaitingOffer',
  'acceptOffer'
];

Renter.POOL_REQUEST_TIMEOUT = 10000;

/**
 * @private
 */
Renter.prototype._read = storj.utils.noop;

/**
 * Starts the renter service
 * @param {Renter~startCallback}
 */
Renter.prototype.start = function(callback) {
  // Set up our database connection for shared contract storage
  this.storage = new Storage(
    merge({
      host: url.parse(this._opts.mongoUrl).hostname,
      port: url.parse(this._opts.mongoUrl).port,
      name: url.parse(this._opts.mongoUrl).path.substr(1)
    }, this._opts.mongoOpts)
  );

  // Set up our RabbitMQ context
  this._amqpContext = rabbitmq.createContext(
    this._opts.amqpUrl,
    this._opts.amqpOpts
  );

  // Set up our network interface to Storj
  this.network = storj.RenterInterface({
    storageManager: storj.StorageManager(
      MongoStorageAdapter(this.storage)
    ),
    rpcPort: this._opts.networkOpts.rpcPort,
    rpcAddress: this._opts.networkOpts.rpcAddress,
    keyPair: storj.KeyPair(this._opts.networkPrivateKey),
    doNotTraverseNat: this._opts.networkOpts.doNotTraverseNat,
    maxTunnels: this._opts.networkOpts.maxTunnels,
    tunnelServerPort: this._opts.networkOpts.tunnelServerPort,
    tunnelGatewayRange: this._opts.networkOpts.tunnelGatewayRange,
    bridgeUri: this._opts.networkOpts.bridgeUri,
    logger: this._logger,
    seedList: this._opts.networkOpts.seedList,
    maxConnections: this._opts.networkOpts.maxConnections
  });

  this.network.on('error', function(err) {
    this._logger.warn(err.message);
  });

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
};
/**
 * @callback Renter~startCallback
 * @param {Error} [error]
 */

/**
 * Initialize the rabbitmq message bus
 * @private
 */
Renter.prototype._initMessageBus = function() {
  /* jshint maxstatements:false */
  var self = this;

  // Setup our amqp sockets
  this.notifier = this._amqpContext.socket('PUBLISH');
  this.publisher = this._amqpContext.socket('PUBLISH');
  this.subscriber = this._amqpContext.socket('SUBSCRIBE');
  this.worker = this._amqpContext.socket('WORKER');

  // We should share our routing table with our renter friends
  // Let's create a channel specifically for that
  this.routerPub = this._amqpContext.socket('PUBLISH');
  this.routerSub = this._amqpContext.socket('SUBSCRIBE');

  // Connect to our renter friends and our landlord
  this.notifier.connect('work.close');
  this.publisher.connect('pool');
  this.subscriber.connect('pool');
  this.worker.connect('work.open');
  this.routerPub.connect('router.events');
  this.routerSub.connect('router.events');

  // Set up handlers for receiving work
  // Set up handlers for renter alerts
  this.worker.on('data', this._handleWork.bind(this));
  this.subscriber.on('data', this._handleAlert.bind(this));
  this.routerSub.on('data', this._handleRouterEvent.bind(this));

  this.network.join(function(err) {
    if (err) {
      return self.emit('error', err);
    }

    // Set up our internal alerts for other renters
    self._handleNetworkEvents();
  });
};

/**
 * Updates our local routing table when a contact is added by another
 * renter in the pool
 * @private
 */
Renter.prototype._handleRouterEvent = function(data) {
  var self = this;
  var event = JSON.parse(data.toString());

  switch (event.type) {
    case 'add':
      this._logger.debug('updating contact from pool event');
      this.network.router.removeAllListeners('add');
      this.network.router.updateContact(storj.Contact(event.data), function() {
        self.on('add', self._onContactAdded.bind(self));
      });
      break;
    case 'drop':
      this._logger.debug('dropping contact from pool event');
      this.network.router.removeAllListeners('drop');
      this.network.router.removeContact(storj.Contact(event.data));
      this.network.router.on('drop', this._onContactDropped.bind(this));
      break;
    case 'shift':
      break;
    default:
      // For now, do nothing at all
  }
};

/**
 * @private
 */
Renter.prototype._onContactAdded = function(contact) {
  this._logger.debug('publishing contact added event');
  this.routerPub.write(Buffer(JSON.stringify({
    type: 'add',
    data: contact
  })));
  this._recordContactSeen(contact);
};

/**
 * @private
 */
Renter.prototype._recordContactSeen = function(contact) {
  this.storage.models.Contact.record(contact);
};

/**
 * @private
 */
Renter.prototype._onContactDropped = function(contact) {
  this._logger.debug('publishing contact dropped event');
  this.routerPub.write(Buffer(JSON.stringify({
    type: 'drop',
    data: contact
  })));
};

/**
 * Listens for network events and fires their appropriate handlers
 * @private
 */
Renter.prototype._handleNetworkEvents = function() {
  // Listen for unhandled offers and alert our renter friends
  // Listen for resolved unhandled offers and alert our renter friends
  this.network.on('unhandledOffer', this._onUnhandledOffer.bind(this));
  this.network.on('unhandledOfferResolved', this._onResolvedOffer.bind(this));
  this.network.router.on('add', this._onContactAdded.bind(this));
  this.network.router.on('drop', this._onContactDropped.bind(this));
  this.network.router.on('shift', this._recordContactSeen.bind(this));

  // Good to go!
  this.emit('ready');
};

/**
 * Handles work received from a landlord
 * @private
 */
Renter.prototype._handleWork = function(buffer) {
  var self = this;
  var data = JSON.parse(buffer.toString());

  // Acknowledge we have received the work
  this.worker.ack();
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

    var args = self._serializeArguments(data.method, arguments);

    self.notifier.write(new Buffer(JSON.stringify({
      id: data.id,
      result: args
    })));
  });

  this._logger.info('calling method: %s', data.method);

  try {
    this.network[data.method].apply(
      this.network,
      this._deserializeArguments(data.method, data.params)
    );
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
 * Handles alerts from other renters
 * @private
 */
Renter.prototype._handleAlert = function(buffer) {
  var self = this;
  var data = JSON.parse(buffer.toString());

  // If this is a response to us and we are waiting, call our callback
  if (this._pendingCallbacks[data.id]) {
    return this._pendingCallbacks[data.id].apply(null, data.result);
  }

  // If this is a request and it's not allowed, do nothing
  if (Renter.SAFE_POOL_METHODS.indexOf(data.method) === -1) {
    return;
  }

  data.params = Array.prototype.slice.call(data.params);

  // Add a callback function to the supplied params that only publishes
  // a response if the result is positive
  data.params.push(function(err, isAwaitingOfferOrDidEndNegotiation) {
    if (err || !isAwaitingOfferOrDidEndNegotiation) {
      return;
    }

    self.publisher.publish('pool', new Buffer(JSON.stringify({
      id: data.id,
      result: [null, true]
    })));
  });

  // Call the method on the network interface
  this.network[data.method].apply(
    this.network,
    this._deserializeArguments(data.method, data.params)
  );
};

/**
 * Alert our renter friends when we get an unhandled offer
 * @private
 */
Renter.prototype._onUnhandledOffer = function(contact, contract, resolver) {
  var self = this;
  var callbackId = uuid.v4();

  // Set up a callback for waiting on a response for the pool
  this._pendingCallbacks[callbackId] = function(err, isAwaiting) {
    resolver(
      err || (!isAwaiting ? new Error('Failed to handle offer') : null)
    );
  };

  // Ask the pool if any of our renter friends are waiting on an offer
  this.publisher.publish('pool', new Buffer(JSON.stringify({
    id: callbackId,
    method: 'isAwaitingOffer',
    params: [
      contract.get('data_hash')
    ]
  })));

  setTimeout(function() {
    if (self._pendingCallbacks[callbackId]) {
      self._pendingCallbacks[callbackId](
        new Error('No renters in pool are waiting for offer')
      );
    }
  }, Renter.POOL_REQUEST_TIMEOUT);
};

/**
 * Another renter resolved our unhandled offer
 * @private
 */
Renter.prototype._onResolvedOffer = function(/* contact, contract */) {
  var callbackId = uuid.v4();
  var args = this._serializeArguments('acceptOffer', arguments);

  this.publisher.publish('pool', new Buffer(JSON.stringify({
    id: callbackId,
    method: 'acceptOffer',
    params: args
  })));
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
    case 'getConnectedContacts':
      break;
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
      args[0] = args[0].map(function(pointerData) {
        return storj.DataChannelPointer(
          storj.Contact(pointerData.contact),
          pointerData.hash,
          pointerData.token,
          pointerData.operation
        );
      });
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
    case 'acceptOffer':
      args[1] = storj.Contract.fromObject(args[1]);
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
    case 'getConnectedContacts':
      break;
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
    case 'acceptOffer':
      args[1] = args[1].toObject();
      break;
    default:
      // noop
  }

  return args;
};

module.exports = Renter;
