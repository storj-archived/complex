'use strict';

var rabbitmq = require('rabbit.js');

/**
 * Sets up rabbitmq context
 * Must be bound to Landlord or Renter instance
 * @private
 */
var setupRabbitmq = function() {
  let self = this;

  if (!this) {
    throw new Error('setupRabbitmq must be bound to a valid object');
  }

  // Set up our RabbitMQ context
  this._amqpContext = rabbitmq.createContext(
    this._opts.amqpUrl,
    this._opts.amqpOpts
  );

  // When our context is good, set up our subscriptions
  this._amqpContext.on('ready', this._initMessageBus.bind(this));

  this._amqpContext.on('error', function(err) {
    self._logger.warn('rabbitmq error: ' + err.message);

    if (err.code === 'ENOTFOUND' ||
        err.code === 'ECONNREFUSED' ||
        err.code === 'ECONNRESET') {
      setTimeout(function() {
        self._logger.warn('reconnecting to rabbitmq...');
        self._setupRabbitmq();
      }, 5000);
    }
  });
};

module.exports = {
  setupRabbitmq
};
