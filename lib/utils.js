var rabbitmq = require('rabbit.js');

/**
 * Sets up rabbitmq context
 * Must be bound to Landlord or Renter instance
 * @private
 */
function setupRabbitmq() {
  let self = this;

  // Set up our RabbitMQ context
  this._amqpContext = rabbitmq.createContext(
    this._opts.amqpUrl,
    this._opts.amqpOpts
  );

  // When our context is good, set up our subscriptions
  this._amqpContext.on('ready', this._initMessageBus.bind(this));

  this._amqpContext.on('close', function() {
    self._logger.warn('rabbitmq connection closed...');
    setTimeout(function() {
      self._logger.warn('reconnecting to rabbitmq...');
      self._setupRabbitmq();
    }, 5000);
  });

  this._amqpContext.on('error', function(err) {
    self._logger.warn('rabbitmq error: ' + err.message);

    if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
      setTimeout(function() {
        self._logger.warn('reconnecting to rabbitmq...');
        self._setupRabbitmq();
      }, 5000);
    }
  });
}

module.exports = {
  setupRabbitmq
};
