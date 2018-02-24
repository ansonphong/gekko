/*
  @askmike
  I propose to create something a bit more clear and subtle: a new class that is responsible for
  doing a single trade (let's call him broker or execution strategy or so), it needs to:

  - Figure out if there is a limit on the size of the trade we can do.
  - If we can't do any trade (low funds) don't do anything.
  - If we can do a trade figure out what kind of trade we aim to do (sell X USD) and trigger an event (see #1850).
  - Try to buy sell according to current "limit order do not cross spread" strategy (explained here).
  - Only when fully completed figure out trade statistics (average execution rate, amount that was traded, etc).
  - Only after this upstream a trade event with the statistics.

  The reason I want to pull this out is so that in the future we can have different execution strategies:
  the current one tries to get the best price - at the cost of execution speed (since it will always
  make orders it might take a long time before the trade is completed, especially when trying to catch
  a trend). Once it's split out we can easily create another one that will do a market order instead.
  Or one that tries to split the order out into multiple small ones (bigger traders need ways to take
  pressure of the market for example).

*/

/*
  The Trade class is responsible for overseeing potentially multiple orders
  to execute a trade that completely moves a position instantiated by the portfolio manager.
*/

var _ = require('lodash')
var util = require('../../core/util')
var dirs = util.dirs()
var events = require('events')
var log = require(dirs.core + 'log')
var async = require('async')
var checker = require(dirs.core + 'exchangeChecker.js')
var moment = require('moment')

class Trade{
  constructor(manager,settings){
    this.manager = manager
    this.exchange = manager.exchange
    this.currency = manager.currency
    this.asset = manager.asset
    this.action = settings.action
    this.isActive = true

    this.orderIds = []

    this.doTrade()
  }

  // This function makes sure the limit order gets submitted
  // to the exchange and initiates order registers watchers.
  doTrade(retry) {
    // if we are still busy executing the last trade
    // cancel that one (and ignore results = assume not filled)
    if(!retry && _.size(this.orderIds))
      return this.cancelLastOrder(() => this.doTrade());

    var act = function() {
      var amount, price;

      if(this.action === 'BUY') {

        amount = this.manager.getBalance(this.currency) / this.manager.ticker.ask;
        if(amount > 0){
            price = this.manager.ticker.bid;
            this.buy(amount, price);
        }
      } else if(this.action === 'SELL') {

        amount = this.manager.getBalance(this.asset) - this.manager.keepAsset;
        if(amount > 0){
            price = this.manager.ticker.ask;
            this.sell(amount, price);
        }
      }
    };
    async.series([
      this.manager.setTicker,
      this.manager.setPortfolio,
      this.manager.setFee
    ], _.bind(act, this));

  };

  // first do a quick check to see whether we can buy
  // the asset, if so BUY and keep track of the order
  // (amount is in asset quantity)
  buy(amount, price) {
    let minimum = 0;
    let process = (err, order) => {
      // if order to small
      if(!order.amount || order.amount < minimum) {
        return log.warn(
          'Wanted to buy',
          this.asset,
          'but the amount is too small ',
          '(' + parseFloat(amount).toFixed(8) + ' @',
          parseFloat(price).toFixed(8),
          ') at',
          this.exchange.name
        );
      }

      log.info(
        'Attempting to BUY',
        order.amount,
        this.asset,
        'at',
        this.exchange.name,
        'price:',
        order.price
      );

      this.exchange.buy(order.amount, order.price, this.noteOrder);
    }

    if (_.has(this.exchange, 'getLotSize')) {
      this.exchange.getLotSize('buy', amount, price, _.bind(process));
    } else {
      minimum = this.manager.getMinimum(price);
      process(undefined, { amount: amount, price: price });
    }
  };

  // first do a quick check to see whether we can sell
  // the asset, if so SELL and keep track of the order
  // (amount is in asset quantity)
  sell(amount, price) {
    let minimum = 0;
    let process = (err, order) => {
      // if order to small
      if (!order.amount || order.amount < minimum) {
        return log.warn(
          'Wanted to buy',
          this.currency,
          'but the amount is too small ',
          '(' + parseFloat(amount).toFixed(8) + ' @',
          parseFloat(price).toFixed(8),
          ') at',
          this.exchange.name
        );
      }

      log.info(
        'Attempting to SELL',
        order.amount,
        this.asset,
        'at',
        this.exchange.name,
        'price:',
        order.price
      );

      this.exchange.sell(order.amount, order.price, this.noteOrder);
    }

    if (_.has(this.exchange, 'getLotSize')) {
      this.exchange.getLotSize('sell', amount, price, _.bind(process));
    } else {
      minimum = this.manager.getMinimum(price);
      process(undefined, { amount: amount, price: price });
    }
  };


  // check whether the order got fully filled
  // if it is not: cancel & instantiate a new order
  checkOrder() {
    var handleCheckResult = function(err, filled) {
      if(!filled) {
        log.info(this.action, 'order was not (fully) filled, cancelling and creating new order');
        this.exchange.cancelOrder(_.last(this.orderIds), _.bind(handleCancelResult, this));

        return;
      }

      log.info(this.action, 'was successfull');

      this.relayOrder();
    }

    var handleCancelResult = function(alreadyFilled) {
      if(alreadyFilled)
        return;

      if(this.exchangeMeta.forceReorderDelay) {
          //We need to wait in case a canceled order has already reduced the amount
          var wait = 10;
          log.debug(`Waiting ${wait} seconds before starting a new trade on ${this.exchangeMeta.name}!`);

          setTimeout(
              () => this.doTrade(this.action, true),
              +moment.duration(wait, 'seconds')
          );
          return;
      }

      this.doTrade(this.action, true);
    }

    this.exchange.checkOrder(_.last(this.orderIds), _.bind(handleCheckResult, this));
  }

  cancelLastOrder(done) {
    this.exchange.cancelOrder(_.last(this.orderIds), alreadyFilled => {
      if(alreadyFilled)
        return this.relayOrder(done);

      this.orderIds = [];
      done();
    });
  }

  noteOrder(err, order) {
    if(err) {
      util.die(err);
    }

    this.orderIds.push(order);

    // If unfilled, cancel and replace order with adjusted price
    let cancelDelay = this.manager.conf.orderUpdateDelay || 1;
    setTimeout(this.checkOrder, util.minToMs(cancelDelay));
  };

  relayOrder(done) {
    // look up all executed orders and relay average.
    var relay = (err, res) => {

      var price = 0;
      var amount = 0;
      var date = moment(0);

      _.each(res.filter(o => !_.isUndefined(o) && o.amount), order => {
        date = _.max([moment(order.date), date]);
        price = ((price * amount) + (order.price * order.amount)) / (order.amount + amount);
        amount += +order.amount;
      });

      async.series([
        this.setPortfolio,
        this.setTicker
      ], () => {
        const portfolio = this.convertPortfolio(this.portfolio);

        this.emit('trade', {
          date,
          price,
          portfolio: portfolio,
          balance: portfolio.balance,

          // NOTE: within the portfolioManager
          // this is in uppercase, everywhere else
          // (UI, performanceAnalyzer, etc. it is
          // lowercase)
          action: this.action.toLowerCase()
        });

        this.orderIds = [];

        if(_.isFunction(done))
          done();
      });

    }

    var getOrders = _.map(
      this.orderIds,
      order => next => this.exchange.getOrder(order, next)
    );

    async.series(getOrders, relay);
  }

}

module.exports = Trade