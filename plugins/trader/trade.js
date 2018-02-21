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

var _ = require('lodash');
var util = require('../../core/util');
var dirs = util.dirs();
var events = require('events');
var log = require(dirs.core + 'log');
var async = require('async');
var checker = require(dirs.core + 'exchangeChecker.js');
var moment = require('moment');

class Trade{
  constructor(trade,manager){
    this.manager = manager

    this.action = trade.action // options BUY/SELL
    this.stat = "unfilled" // options unfilled/partial/filled
    //this.manager.currencyAmount = trade.currencyAmount


    // used to calculate slippage
    this.initPrice = trade.initPrice 

    this.manager.currencyAllowance = trade.currencyAllowance
    this.keepAsset = trade.keepAsset

    this.averagePrice = 0
    this.averageSlippage = 0

    this.activeOrder = {
      txid: 0,
      currencyAmount: 0,
      assetAmount: 0,
      price: 0,
      slippage: 0,
      offset: 0
    }

    this.orders = []

    this.try = 1

    this.manager.assetAmountTraded = 0
    this.lastAssetBalance = 0

  }


  init(){

    this.doTrade()

  }



  deinit(callback,param){

    var done = () => {
      this.manager.tradeHistory.push(this)
      this.manager.currentTrade = false
      if(callback)
        callback(param)
    }

    this.cancelLastOrder(done)

  }


  doTrade(retry){

    // if it's in the middle of calls
    if(this.isActive)
      // delay execution, unless 

    // all trade calls happen in here



    // LEGACY

    // if we are still busy executing the last trade
    // cancel that one (and ignore results = assume not filled)
    if(!retry && _.size(this.orders))
      return this.cancelLastOrder(() => this.doTrade());

    if(!retry) {
      if(this.currentTrade)
        this.tradeHistory.push(this.currentTrade)
      this.currentTrade = new Trade({action: what})
      this.currentTrade.init()
    } else {
      this.currentTrade.try++;
    }


    var act = function() {
      let amount, price, maxTryCurrency;

      if(this.currentTrade.try === 1)
        this.logPortfolio();
      
      if(this.currentTrade.isPartiallyFilled()) {

        // how much of the last asset order was filled
        let currentTradeLastAssetOrder = this.getBalance(this.manager.asset) - this.currentTrade.lastAssetBalance;

        this.currentTradeAveragePrice =
            (currentTradeLastAssetOrder * this.currentTradeLastTryPrice
            + this.currentTradeAssetAmountTraded * this.currentTradeAveragePrice)
            / (currentTradeLastAssetOrder + this.currentTradeAssetAmountTraded);

        this.currentTradeAssetAmountTraded = this.currentTradeAssetAmountTraded + currentTradeLastAssetOrder;


        this.currentTrade.logOrderSummary()


      }

      this.currentTrade.lastAssetBalance = this.getBalance(this.manager.asset);
      this.currentTradeLastTryPrice = this.ticker.ask;




      if(what === 'BUY') {
        amount = this.getBalance(this.manager.currency) / this.ticker.ask;
        if (this.manager.currencyAllowance !== false) {
          maxTryCurrency = this.manager.currencyAllowance - (this.currentTradeAssetAmountTraded * this.currentTradeAveragePrice)
          if (this.getBalance(this.manager.currency) > maxTryCurrency) {
            amount = maxTryCurrency / this.ticker.ask;
          } else {
            amount = this.getBalance(this.manager.currency) / this.ticker.ask;
          }
        }
        this.currentTradeLastAmount = amount;
        if(amount > 0){
            price = this.ticker.bid;
            this.buy(amount, price);
        } else {
          log.debug('Skipping trade as tradable currency balance is 0', this.manager.currency);
        }




      } else if(what === 'SELL') {
        amount = this.getBalance(this.manager.asset) - this.keepAsset;
        this.currentTradeLastAmount = amount;
        if(amount > 0){
            price = this.ticker.ask;
            this.sell(amount, price);
          } else {
            log.debug('Skipping trade as tradable asset balance is 0', this.manager.asset);
        }
      }


    };

    async.series([
      this.setTicker,
      this.setPortfolio,
      this.setFee
    ], _.bind(act, this));



  }



  // the change in asset balance at the exchange is used to
  // check whether the last attempt was partially filled
  // this method is liable to err if assets withdrawn or deposited
  // during a prolonged trade attempt involving many retries
  isPartiallyFilled(){
    return (this.try > 1 && this.manager.getBalance(this.manager.asset) != this.lastAssetBalance);
  }

  getLastOrderId(){
    return _.last(this.orders).id
  }

  // all up all the order amounts and compare to the initial price
  getAverageSlippage(){
    
  }

  // add up all orders in the order history and get weighted average
  getAveragePrice(){
    
  }

  // add up all amounts filled in the order history
  getAssetAmountTraded(){
    
  }



  logOrderSummary(){
    log.info(
        'So far, traded',
        this.currentTradeAssetAmountTraded,
        this.manager.asset,
        'for approx',
        (this.currentTradeAssetAmountTraded * this.currentTradeAveragePrice),
        this.manager.currency,
        'Approx average price:',
        this.currentTradeAveragePrice
      );
  }



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
          this.manager.asset,
          'but the amount is too small ',
          '(' + parseFloat(amount).toFixed(8) + ' @',
          parseFloat(price).toFixed(8),
          ') at',
          this.manager.exchange.name
        );
      }

      log.info(
        'Attempting to BUY',
        order.amount,
        this.manager.asset,
        'at',
        this.manager.exchange.name,
        'price:',
        order.price
      );

      this.lastOrder = order

      this.manager.exchange.buy(order.amount, order.price, this.noteOrder);

    }

    if (_.has(this.manager.exchange, 'getLotSize')) {
      
      this.manager.exchange.getLotSize('buy', amount, price, _.bind(process));

    } else {

      minimum = this.getMinimum(price);
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
          this.manager.currency,
          'but the amount is too small ',
          '(' + parseFloat(amount).toFixed(8) + ' @',
          parseFloat(price).toFixed(8),
          ') at',
          this.manager.exchange.name
        );
      }

      log.info(
        'Attempting to SELL',
        order.amount,
        this.manager.asset,
        'at',
        this.manager.exchange.name,
        'price:',
        order.price
      );

      this.manager.exchange.sell(order.amount, order.price, this.noteOrder);
    }

    if (_.has(this.manager.exchange, 'getLotSize')) {
      this.manager.exchange.getLotSize('sell', amount, price, _.bind(process));
    } else {
      minimum = this.getMinimum(price);
      process(undefined, { amount: amount, price: price });
    }
  };


  noteOrder(err, order) {
    if(err) {
      util.die(err);
    }

    // TODO : remove this
    this.orders.push(order);

    this.currentTrade.orders.push(order);

    /*
    this.currentTrade.orders.push({
      txid: order,
      amount: this.lastOrder.amount,
      price: this.lastOrder.price,
      filledAmount: 0
    })
    */


    // If unfilled, cancel and replace order with adjusted price
    let cancelDelay = this.conf.orderUpdateDelay || 1;
    setTimeout(this.checkOrder, util.minToMs(cancelDelay));
  };


  cancelLastOrder(done) {
    this.manager.exchange.cancelOrder(_.last(this.orders), alreadyFilled => {
      if(alreadyFilled)
        return this.relayOrder(done);

      this.orders = [];
      done();
    });
  }

  // check whether the order got fully filled
  // if it is not: cancel & instantiate a new order
  checkOrder() {
    var handleCheckResult = function(err, filled) {
      if(!filled) {
        log.info(this.currentTrade.action, 'order was not (fully) filled, cancelling and creating new order');
        this.manager.exchange.cancelOrder(_.last(this.orders), _.bind(handleCancelResult, this));

        return;
      }

      if(this.currentTrade.try > 1) {
        // we do not need to get exchange balance again to calculate final trades as we can assume the last order amount was fully filled
        let currentTradeLastAssetOrder = this.currentTradeLastAmount;
        if (this.currentTrade.action == 'SELL') {
          currentTradeLastAssetOrder = 0-this.currentTradeLastAmount
        }
        this.currentTradeAveragePrice = (currentTradeLastAssetOrder * this.currentTradeLastTryPrice + this.currentTradeAssetAmountTraded * this.currentTradeAveragePrice) / (lastAssetOrder + this.currentTradeAssetAmountTraded);
        this.currentTradeAssetAmountTraded = this.currentTradeAssetAmountTraded + currentTradeLastAssetOrder;
        log.info(
          this.currentTrade.action,
          'was successful after',
          this.currentTrade.try,
          'tries, trading',
          this.currentTradeAssetAmountTraded,
          this.manager.asset,
          'for approx',
          (this.currentTradeAssetAmountTraded * this.currentTradeAveragePrice),
          this.manager.currency,
          'Approx average price:',
          this.currentTradeAveragePrice
        );
      } else {
        log.info(this.currentTrade.action, 'was successful after the first attempt');
      }
      
      // update currencyAllowance based on whether this had been a sell order or a buy order
      if(this.manager.currencyAllowance !== false) {
        if(this.currentTrade.action === 'BUY') {
          this.manager.currencyAllowance = 0;
        } else if(this.currentTrade.action === 'SELL') { 
          this.manager.currencyAllowance = this.manager.currencyAllowance + (-this.currentTradeAssetAmountTraded * this.currentTradeAveragePrice);
        }
        log.info('Buy orders currently restricted to', this.manager.currencyAllowance, this.manager.currency);
      }

      this.relayOrder();
    }

    var handleCancelResult = function(alreadyFilled) {
      if(alreadyFilled)
        return;

      if(this.manager.exchangeMeta.forceReorderDelay) {
          //We need to wait in case a canceled order has already reduced the amount
          var wait = 10;
          log.debug(`Waiting ${wait} seconds before starting a new trade on ${this.manager.exchangeMeta.name}!`);

          setTimeout(
              () => this.trade(this.currentTrade.action, true),
              +moment.duration(wait, 'seconds')
          );
          return;
      }

      this.trade(this.currentTrade.action, true);
    }

    this.manager.exchange.checkOrder(_.last(this.orders), _.bind(handleCheckResult, this));
  }




}

module.exports = Trade;