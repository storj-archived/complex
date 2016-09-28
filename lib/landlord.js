'use strict';

var restify = require('restify');
var storj = require('storj-lib');
var ReadableStream = require('readable-stream');
var inherits = require('util').inherits;
var rabbitmq = require('rabbit.js');
var Logger = require('kad-logger-json');
var merge = require('merge');
var assert = require('assert');
var LandlordConfig = require('./config').LandlordConfig;

/**
 * Creates an RPC server for issuing work to a renter pool
 * @constructor
 * @param {Object} options
 * @param {Number} options.serverPort - The port to listen on
 * @param {Object} options.serverOpts - Options to pass wot Restify server
 * @param {String} options.amqpUrl - The RabbitMQ server URL
 * @param {Object} options.amqpOpts - Option to pass to RabbitMQ context
 * @param {Number} options.logLevel - The verbosity level for logging
 */
function Landlord(options) {
  if (!(this instanceof Landlord)) {
    return new Landlord(options);
  }

  this._opts = options instanceof LandlordConfig ?
               options.toObject() :
               options;
  this._logger = new Logger(this._opts.logLevel);
  this._pendingResponses = {};

  this.server = restify.createServer(merge({
    name: 'Storj Complex'
  }, this._opts.serverOpts));

  this._bindServerRoutes();
  ReadableStream.call(this);
  this._logger.on('data', this.push.bind(this));
}

inherits(Landlord, ReadableStream);

Landlord.REQUEST_TIMEOUT = 60000;

/**
 * @private
 */
Landlord.prototype._read = storj.utils.noop;

/**
 * Binds the server routes
 * @private
 */
Landlord.prototype._bindServerRoutes = function() {
  this._logger.info('binding rpc server routes');
  this.server.use(restify.authorizationParser());
  this.server.use(restify.bodyParser());
  this.server.post('/', this._handleJsonRpcRequest.bind(this));
};

/**
 * Starts the landlord service
 * @param {Landlord~startCallback}
 */
Landlord.prototype.start = function(callback) {
  var self = this;

  // Start our RPC server
  this._logger.info('starting rpc server on port %s', this._opts.serverPort);
  this.server.listen(this._opts.serverPort);

  // Set up our RabbitMQ context
  this._amqpContext = rabbitmq.createContext(
    this._opts.amqpUrl,
    this._opts.amqpOpts
  );

  // When our context is good, set up our subscriptions
  this._logger.info('opening connection to rabbitmq');
  this._amqpContext.on('ready', this._initMessageBus.bind(this));

  // When we are all connected, fire the callback
  this.once('ready', function() {
    self._logger.info('landlord is connected and listening');
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
 * @callback Landlord~startCallback
 * @param {Error} [error]
 */

/**
 * Initialize the rabbitmq message bus
 * @private
 */
Landlord.prototype._initMessageBus = function() {
  this._logger.info('initializing message bus');

  // Setup our amqp sockets
  this.publisher = this._amqpContext.socket('PUBLISH');
  this.subscriber = this._amqpContext.socket('SUBSCRIBE');
  this.pusher = this._amqpContext.socket('PUSH');

  // Connect to our renter minion and listen for finished work
  this.publisher.connect('pool');
  this.subscriber.connect('work.close');
  this.pusher.connect('work.open');

  // Set up handlers for receiving work
  // Set up handlers for renter alerts
  this.subscriber.on('data', this._handleWorkResult.bind(this));
  this.emit('ready');
};

/**
 * Handles an incoming JSON-RPC request
 * @private
 */
Landlord.prototype._handleJsonRpcRequest = function(req, res) {
  var self = this;
  var authRequest = req.authorization.basic;
  var authConfig = this._opts.serverOpts.authorization;

  // Make sure that the auth credentials match what's configured
  if (
    typeof authRequest === 'undefined' ||
    !(authRequest.username === authConfig.username &&
      authRequest.password === authConfig.password)
  ) {
    this._logger.warn('unauthorized rpc attempt');
    return res.send(new restify.errors.UnauthorizedError('Not authorized'));
  }

  // Make sure this is a valid JSON RPC request
  if (!this._isValidJsonRpcRequest(req.body)) {
    this._logger.warn('invalid rpc message received');
    return res.send(new restify.errors.BadRequestError('Bad request'));
  }

  // Keep track of the response object for later
  this._pendingResponses[req.body.id] = res;

  // Add work to the renter pool
  this._logger.info('writing to worker pool');
  this._logger.debug('rpc: %j', req.body);
  this.pusher.write(new Buffer(JSON.stringify(req.body)));

  // If work isn't completed in time, respond with an error
  setTimeout(function() {
    if (!self._pendingResponses[req.body.id]) {
      return;
    }

    self._logger.warn('job %s timed out', req.body.id);
    self._pendingResponses[req.body.id].send(
      new restify.errors.RequestTimeoutError()
    );

    delete self._pendingResponses[req.body.id];
  }, Landlord.REQUEST_TIMEOUT);
};

/**
 * Validates a JSON-RPC request
 * @private
 */
Landlord.prototype._isValidJsonRpcRequest = function(body) {
  try {
    assert(typeof body.id === 'string');
    assert(Array.isArray(body.params));
    assert(typeof body.method === 'string');
  } catch (err) {
    return false;
  }

  return true;
};

/**
 * Handle the result of some work completed
 * @private
 */
Landlord.prototype._handleWorkResult = function(buffer) {
  var self = this;
  var data = JSON.parse(buffer.toString());

  // If this response already timed out do nothing
  if (!self._pendingResponses[data.id]) {
    return this._logger.warn('job %s completed late', data.id);
  }

  // If we got error back, then send a error code
  if (data.error) {
    self._logger.warn('error returned from work result on job %s', data.id);
    self._logger.debug('error result: %j', data);
    return self._pendingResponses[data.id].send(
      new restify.errors.InternalServerError(data.error.message)
    );
  }

  data.result = this._objectToArray(data.result);

  // Otherwise forward the result and delete the reference
  self._logger.info('job %s completed successfully', data.id);
  self._logger.debug('job result: %j', data);
  self._pendingResponses[data.id].send(data);
  delete self._pendingResponses[data.id];
};

/**
 * Convert data.result into a actual array
 * @private
 */
Landlord.prototype._objectToArray = function(obj) {
  var args = [];

  for (var i = 0; i < Object.keys(obj).length; i++) {
    args[i] = obj[i];
  }

  return args;
};

module.exports = Landlord;
