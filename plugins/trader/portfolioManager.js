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

  // contains instantiated trade classes
  this.currentTrade = false
  this.tradeHistory = [];

  if(_.isNumber(conf.keepAsset)) {
    log.debug('Keep asset is active. Will try to keep at least ' + conf.keepAsset + ' ' + conf.asset);
    this.keepAsset = conf.keepAsset;
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

Manager.prototype.getMinimum = function(price) {
  if(this.minimalOrder.unit === 'currency')
    return minimum = this.minimalOrder.amount / price;
  else
    return minimum = this.minimalOrder.amount;
};

Manager.prototype.trade = function(what) {

  var makeNewTrade = function(){
    this.newTrade(what)
  }.bind(this)

  // if an active trade is currently happening
  if(this.currentTrade && this.currentTrade.isActive){
    if(this.currentTrade.action !== what){
      // if the action is different, stop the current trade, then start a new one
      this.currentTrade.stop(makeNewTrade)
    } else{
      // do nothing, the trade is already going
    }
  } else {
    makeNewTrade()
  }
};

// instantiate a new trade object
// TODO - impliment different trade execution types / strategies
//        by invoking variable trade subclasses
//      - pass the trade a specific amount limited by a currency allowance
Manager.prototype.newTrade = function(what) {
  // push the current (asummed to be inactive) trade to the history
  if(this.currentTrade){
    this.tradeHistory.push(this.currentTrade)
    this.currentTrade = false
  }
  return this.currentTrade = new Trade(this,{action: what})
};

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

Manager.prototype.logPortfolio = function() {
  log.info(this.exchange.name, 'portfolio:');
  _.each(this.portfolio, function(fund) {
    log.info('\t', fund.name + ':', parseFloat(fund.amount).toFixed(12));
  });
};


module.exports = Manager;
