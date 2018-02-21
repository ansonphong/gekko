/*

  The portfolio manager is responsible for making sure that
  all decisions are turned into orders and make sure these orders
  get executed. Besides the orders the manager also keeps track of
  the client's portfolio.

  NOTE: Execution strategy is limit orders (to not cross the book)

*/

var _ = require('lodash');
var util = require('../../core/util');
var dirs = util.dirs();
var events = require('events');
var log = require(dirs.core + 'log');
var async = require('async');
var checker = require(dirs.core + 'exchangeChecker.js');
var moment = require('moment');
var Trade = require('./trade');

var Manager = function(conf) {
  _.bindAll(this);

  var error = checker.cantTrade(conf);
  if(error)
    util.die(error);

  this.exchangeMeta = checker.settings(conf);

  // create an exchange
  var Exchange = require(dirs.exchanges + this.exchangeMeta.slug);
  this.exchange = new Exchange(conf);

  this.conf = conf;
  this.portfolio = {};
  this.fee;
  

  this.marketConfig = _.find(this.exchangeMeta.markets, function(p) {
    return _.first(p.pair) === conf.currency.toUpperCase() && _.last(p.pair) === conf.asset.toUpperCase();
  });
  this.minimalOrder = this.marketConfig.minimalOrder;

  this.currency = conf.currency;
  this.asset = conf.asset;
  this.keepAsset = 0;
  


  this.action; // TODO : move referrences of this to currentTrade
  this.currencyAllowance = false;
  this.compoundAllowance = true; // allowance will include profits made from current strategy
  this.netCurrencyAllowance = false;
  // this is the model for a trade object, which is pushed to tradeHistory on completion
  this.currentTrade = false;
  // the trade history is an array of trade objects
  // which are trades which were completely filled
  this.tradeHistory = [];  

  // resets after every order
  this.orders = [];



  // From @Ali1 modifications
  this.currentTradeTry;
  this.currentTradeAveragePrice = 0;
  this.currentTradeAssetAmountTraded;
  this.currentTradeLastTryBalance;
  this.currentTradeLastAmount;
  this.currentTradeLastTryPrice;


  if(_.isNumber(conf.keepAsset)) {
    log.debug('Keep asset is active. Will try to keep at least ' + conf.keepAsset + ' ' + conf.asset);
    this.keepAsset = conf.keepAsset;
  }

  if(_.isNumber(conf.currencyAllowance)) {
    this.currencyAllowance = conf.currencyAllowance;
  }

};

// teach our trader events
util.makeEventEmitter(Manager);

Manager.prototype.init = function(callback) {
  log.debug('getting ticker, balance & fee from', this.exchange.name);
  var prepare = function() {
    this.starting = false;

    log.info('trading at', this.exchange.name, 'ACTIVE');
    log.info(this.exchange.name, 'trading fee will be:', this.fee * 100 + '%');
    this.logPortfolio();

    callback();
  };

  async.series([
    this.setTicker,
    this.setPortfolio,
    this.setFee
  ], _.bind(prepare, this));
}

Manager.prototype.setPortfolio = function(callback) {
  var set = function(err, fullPortfolio) {
    if(err)
      util.die(err);

    // only include the currency/asset of this market
    const portfolio = [ this.conf.currency, this.conf.asset ]
      .map(name => {
        let item = _.find(fullPortfolio, {name});

        if(!item) {
          log.debug(`Unable to find "${name}" in portfolio provided by exchange, assuming 0.`);
          item = {name, amount: 0};
        }

        return item;
      });

    if(_.isEmpty(this.portfolio))
      this.emit('portfolioUpdate', this.convertPortfolio(portfolio));

    this.portfolio = portfolio;

    if(this.currencyAllowance !== false &&
       this.getBalance(this.currency) < this.currencyAllowance) {
      // reduce currencyAllowance to equal the current balance
      // if the current balance is lower than the configured currencyAllowance
      if(this.getBalance(this.currency) < 0)
        this.currencyAllowance = 0;
      else
        this.currencyAllowance = this.getBalance(this.currency);
    }

    if(_.isFunction(callback))
      callback();

  }.bind(this);

  this.exchange.getPortfolio(set);
};

Manager.prototype.setFee = function(callback) {
  var set = function(err, fee) {
    this.fee = fee;

    if(err)
      util.die(err);

    if(_.isFunction(callback))
      callback();
  }.bind(this);
  this.exchange.getFee(set);
};

Manager.prototype.setTicker = function(callback) {
  var set = function(err, ticker) {
    this.ticker = ticker;

    if(err)
      util.die(err);
    
    if(_.isFunction(callback))
      callback();
  }.bind(this);
  this.exchange.getTicker(set);
};

// return the [fund] based on the data we have in memory
Manager.prototype.getFund = function(fund) {
  return _.find(this.portfolio, function(f) { return f.name === fund});
};
Manager.prototype.getBalance = function(fund) {
  return this.getFund(fund).amount;
};



// This function makes sure the limit order gets submitted
// to the exchange and initiates order registers watchers.
Manager.prototype.trade = function(what, retry) {

  // if we are still busy executing the last trade
  // cancel that one (and ignore results = assume not filled)
  if(!retry && _.size(this.orders))
    return this.cancelLastOrder(() => this.trade(what));

  if(!retry) {
    // first trade attempt, reset current trade variables
    this.currentTradeAssetAmountTraded = 0;
    this.currentTradeTry = 1;
  } else {
    this.currentTradeTry++;
  }

  this.action = what;

  var act = function() {
    var amount, price, maxTryCurrency;
    if(this.currentTradeTry === 1) // prior to first trade only
      this.logPortfolio();
    
    // the change in asset balance at the exchange is used to
    // check whether the last attempt was partially filled
    // this method is liable to err if assets withdrawn or deposited
    // during a prolonged trade attempt involving many retries
    if(this.currentTradeTry > 1 &&
       this.getBalance(this.asset) != this.currentTradeLastTryBalance) {

      // how much of the last asset order was filled
      let currentTradeLastAssetOrder = this.getBalance(this.asset) - this.currentTradeLastTryBalance;

      this.currentTradeAveragePrice =
          (currentTradeLastAssetOrder * this.currentTradeLastTryPrice
          + this.currentTradeAssetAmountTraded * this.currentTradeAveragePrice)
          / (currentTradeLastAssetOrder + this.currentTradeAssetAmountTraded);

      this.currentTradeAssetAmountTraded = this.currentTradeAssetAmountTraded + currentTradeLastAssetOrder;

      log.info(
        'So far, traded',
        this.currentTradeAssetAmountTraded,
        this.asset,
        'for approx',
        (this.currentTradeAssetAmountTraded * this.currentTradeAveragePrice),
        this.currency,
        'Approx average price:',
        this.currentTradeAveragePrice
      );
    }

    this.currentTradeLastTryBalance = this.getBalance(this.asset);
    this.currentTradeLastTryPrice = this.ticker.ask;

    if(what === 'BUY') {
      amount = this.getBalance(this.currency) / this.ticker.ask;
      if (this.currencyAllowance !== false) {
        maxTryCurrency = this.currencyAllowance - (this.currentTradeAssetAmountTraded * this.currentTradeAveragePrice)
        if (this.getBalance(this.currency) > maxTryCurrency) {
          amount = maxTryCurrency / this.ticker.ask;
        } else {
          amount = this.getBalance(this.currency) / this.ticker.ask;
        }
      }
      this.currentTradeLastAmount = amount;
      if(amount > 0){
          price = this.ticker.bid;
          this.buy(amount, price);
      } else {
        log.debug('Skipping trade as tradable currency balance is 0', this.currency);
      }

    } else if(what === 'SELL') {
      amount = this.getBalance(this.asset) - this.keepAsset;
      this.currentTradeLastAmount = amount;
      if(amount > 0){
          price = this.ticker.ask;
          this.sell(amount, price);
        } else {
          log.debug('Skipping trade as tradable asset balance is 0', this.asset);
      }
    }
  };

  async.series([
    this.setTicker,
    this.setPortfolio,
    this.setFee
  ], _.bind(act, this));

};

Manager.prototype.getMinimum = function(price) {
  if(this.minimalOrder.unit === 'currency')
    return minimum = this.minimalOrder.amount / price;
  else
    return minimum = this.minimalOrder.amount;
};

// first do a quick check to see whether we can buy
// the asset, if so BUY and keep track of the order
// (amount is in asset quantity)
Manager.prototype.buy = function(amount, price) {
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
    minimum = this.getMinimum(price);
    process(undefined, { amount: amount, price: price });
  }
};

// first do a quick check to see whether we can sell
// the asset, if so SELL and keep track of the order
// (amount is in asset quantity)
Manager.prototype.sell = function(amount, price) {
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
    minimum = this.getMinimum(price);
    process(undefined, { amount: amount, price: price });
  }
};

Manager.prototype.noteOrder = function(err, order) {
  if(err) {
    util.die(err);
  }

  this.orders.push(order);

  // If unfilled, cancel and replace order with adjusted price
  let cancelDelay = this.conf.orderUpdateDelay || 1;
  setTimeout(this.checkOrder, util.minToMs(cancelDelay));
};


Manager.prototype.cancelLastOrder = function(done) {
  this.exchange.cancelOrder(_.last(this.orders), alreadyFilled => {
    if(alreadyFilled)
      return this.relayOrder(done);

    this.orders = [];
    done();
  });
}

// check whether the order got fully filled
// if it is not: cancel & instantiate a new order
Manager.prototype.checkOrder = function() {
  var handleCheckResult = function(err, filled) {
    if(!filled) {
      log.info(this.action, 'order was not (fully) filled, cancelling and creating new order');
      this.exchange.cancelOrder(_.last(this.orders), _.bind(handleCancelResult, this));

      return;
    }

    if(this.currentTradeTry > 1) {
      // we do not need to get exchange balance again to calculate final trades as we can assume the last order amount was fully filled
      let currentTradeLastAssetOrder = this.currentTradeLastAmount;
      if (this.action == 'SELL') {
        currentTradeLastAssetOrder = 0-this.currentTradeLastAmount
      }
      this.currentTradeAveragePrice = (currentTradeLastAssetOrder * this.currentTradeLastTryPrice + this.currentTradeAssetAmountTraded * this.currentTradeAveragePrice) / (lastAssetOrder + this.currentTradeAssetAmountTraded);
      this.currentTradeAssetAmountTraded = this.currentTradeAssetAmountTraded + currentTradeLastAssetOrder;
      log.info(
        this.action,
        'was successful after',
        this.currentTradeTry,
        'tries, trading',
        this.currentTradeAssetAmountTraded,
        this.asset,
        'for approx',
        (this.currentTradeAssetAmountTraded * this.currentTradeAveragePrice),
        this.currency,
        'Approx average price:',
        this.currentTradeAveragePrice
      );
    } else {
      log.info(this.action, 'was successful after the first attempt');
    }
    
    // update currencyAllowance based on whether this had been a sell order or a buy order
    if(this.currencyAllowance !== false) {
      if(this.action === 'BUY') {
        this.currencyAllowance = 0;
      } else if(this.action === 'SELL') { 
        this.currencyAllowance = this.currencyAllowance + (-this.currentTradeAssetAmountTraded * this.currentTradeAveragePrice);
      }
      log.info('Buy orders currently restricted to', this.currencyAllowance, this.currency);
    }

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
            () => this.trade(this.action, true),
            +moment.duration(wait, 'seconds')
        );
        return;
    }

    this.trade(this.action, true);
  }

  this.exchange.checkOrder(_.last(this.orders), _.bind(handleCheckResult, this));
}

// convert into the portfolio expected by the performanceAnalyzer
Manager.prototype.convertPortfolio = function(portfolio) {
  var asset = _.find(portfolio, a => a.name === this.asset).amount;
  var currency = _.find(portfolio, a => a.name === this.currency).amount;

  return {
    currency,
    asset,
    balance: currency + (asset * this.ticker.bid)
  }
}

Manager.prototype.relayOrder = function(done) {
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

      this.orders = [];

      if(_.isFunction(done))
        done();
    });

  }

  var getOrders = _.map(
    this.orders,
    order => next => this.exchange.getOrder(order, next)
  );

  async.series(getOrders, relay);
}

Manager.prototype.logPortfolio = function() {
  log.info(this.exchange.name, 'portfolio:');
  _.each(this.portfolio, function(fund) {
    log.info('\t', fund.name + ':', parseFloat(fund.amount).toFixed(12));
  });
  if(this.currencyAllowance !== false) {
    log.info('\t', 'Buy orders currently restricted to', this.currencyAllowance, this.currency);
  }
};

module.exports = Manager;
