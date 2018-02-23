var _ = require('lodash');
var util = require('../../core/util');
var dirs = util.dirs();
var events = require('events');
var log = require(dirs.core + 'log');
var async = require('async');
var checker = require(dirs.core + 'exchangeChecker.js');
var moment = require('moment');

/*
  The Order class is responsible for creating an order on the exchange
  and then checking up to see if it has been filled, etc.

  TODO:
  - handle when user manually cancels an order
  - impliment auto adjusting orders from Trade class
    this will allow for dynamic gradient orders and lowball orders

*/


class Order{
  constructor(trade,settings){
    this.trade = trade // store a referrence to the parent trade
    this.exchange = this.trade.manager.exchange

    this.action = trade.action
    this.txid = false // id of this order on the exchange
    this.type = "limit" // limit/market/stoplimit
    this.stat = "placing" // placing/open/filled/cancelled

    this.offset = 0

    this.currencyAmount = 0
    this.price = 0
    this.assetAmount = 0
    this.assetAmountFilled = 0

    switch(this.type){
      case "limit":
        this.price = settings.price
        this.assetAmount = settings.assetAmount
        break
      case "market":
        this.currencyAmount = settings.currencyAmount
        break
    }

    this.place()

  }

  place(){
    // place the buy or sell order on the exchange

    this.stat = "open"

  }

  replace(){
    // replace the same order with updated params, if autojust triggered
  }

  // update data from the exchange
  update(){
    if(this.stat !== "active")
      return false

    if(this.txid)
      this.exchange.getOrder(this.txid, (res) => {
        this.assetAmountFilled = res.amount

        // TODO : modify this to manage potentially multiple orders going simultaneously
        this.trade.orderUpdated(this)

        // TODO : add condition if not filled, then schedule update
        this.scheduleUpdate()
      })
  }

  scheduleUpdate(){
    // set timeout to tick, run update
  }

  cancel(callback){
    // TODO : find way to schedule them to be cancelled, to not interupt existing process
    // create event queue in order object? ["update","cancel"]

    // retry X times, and then return callback after X times trying

    // then
      this.currentOrder.stat = "cancelled"
      log.debug("successfully cancelled order:", this.txid)

      callback(res)

      log.debug("could not cancel order:", this.txid, ", rescheduling")

  }


  execQueue(){
    // exec queued events which might have interupted existing processes
    // or else make a this.cancel bool and if it's true check and cancel??
  }


  // TODO : assess if this is needed, potentially integrate into UPDATE method
  // the change in asset balance at the exchange is used to
  // check whether the last attempt was partially filled
  // this method is liable to err if assets withdrawn or deposited
  // during a prolonged trade attempt involving many retries
  isPartiallyFilled(){
    return (this.attempts > 1 && this.manager.getBalance(this.manager.asset) != this.lastAssetBalance)
  }

  // check whether the order got fully filled
  // if it is not: cancel & instantiate a new order
  checkOrder() {
    var handleCheckResult = function(err, filled) {
      if(!filled) {
        log.info(this.currentTrade.action, 'order was not (fully) filled, cancelling and creating new order')
        this.exchange.cancelOrder(_.last(this.orders), _.bind(handleCancelResult, this))

        return
      }

      if(this.attempts > 1) {
        // we do not need to get exchange balance again to calculate final trades as we can assume the last order amount was fully filled
        let currentTradeLastAssetOrder = this.currentTradeLastAmount
        if (this.currentTrade.action == 'SELL') {
          currentTradeLastAssetOrder = 0-this.currentTradeLastAmount
        }
        this.currentTradeAveragePrice = (currentTradeLastAssetOrder * this.currentTradeLastTryPrice + this.currentTradeAssetAmountTraded * this.currentTradeAveragePrice) / (lastAssetOrder + this.currentTradeAssetAmountTraded)
        this.currentTradeAssetAmountTraded = this.currentTradeAssetAmountTraded + currentTradeLastAssetOrder
        log.info(
          this.currentTrade.action,
          'was successful after',
          this.attempts,
          'tries, trading',
          this.currentTradeAssetAmountTraded,
          this.manager.asset,
          'for approx',
          (this.currentTradeAssetAmountTraded * this.currentTradeAveragePrice),
          this.manager.currency,
          'Approx average price:',
          this.currentTradeAveragePrice
        )
      } else {
        log.info(this.currentTrade.action, 'was successful after the first attempt')
      }
      
      // update currencyAllowance based on whether this had been a sell order or a buy order
      if(this.manager.currencyAllowance !== false) {
        if(this.currentTrade.action === 'BUY') {
          this.manager.currencyAllowance = 0
        } else if(this.currentTrade.action === 'SELL') { 
          this.manager.currencyAllowance = this.manager.currencyAllowance + (-this.currentTradeAssetAmountTraded * this.currentTradeAveragePrice)
        }
        log.info('Buy orders currently restricted to', this.manager.currencyAllowance, this.manager.currency)
      }

      this.relayOrder()
    }

    var handleCancelResult = function(alreadyFilled) {
      if(alreadyFilled)
        return

      if(this.exchangeMeta.forceReorderDelay) {
          //We need to wait in case a canceled order has already reduced the amount
          var wait = 10
          log.debug(`Waiting ${wait} seconds before starting a new trade on ${this.exchangeMeta.name}!`)

          setTimeout(
              () => this.doTrade(),
              +moment.duration(wait, 'seconds')
          )
          return
      }

      this.doTrade()
    }

    this.exchange.checkOrder(_.last(this.orders), _.bind(handleCheckResult, this))
  }



  // first do a quick check to see whether we can buy
  // the asset, if so BUY and keep track of the order
  // (amount is in asset quantity)
  buy(amount, price) {
    let minimum = 0
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
          this.exchange.name
        )
      }

      log.info(
        'Attempting to BUY',
        order.amount,
        this.manager.asset,
        'at',
        this.exchange.name,
        'price:',
        order.price
      )

      this.lastOrder = order

      this.exchange.buy(order.amount, order.price, this.noteOrder)

    }

    if (_.has(this.exchange, 'getLotSize')) {
      
      this.exchange.getLotSize('buy', amount, price, _.bind(process))

    } else {

      minimum = this.getMinimum(price)
      process(undefined, { amount: amount, price: price })

    }


  }

  // first do a quick check to see whether we can sell
  // the asset, if so SELL and keep track of the order
  // (amount is in asset quantity)
  sell(amount, price) {
    let minimum = 0
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
          this.exchange.name
        )
      }

      log.info(
        'Attempting to SELL',
        order.amount,
        this.manager.asset,
        'at',
        this.exchange.name,
        'price:',
        order.price
      )

      this.exchange.sell(order.amount, order.price, this.noteOrder)
    }

    if (_.has(this.exchange, 'getLotSize')) {
      this.exchange.getLotSize('sell', amount, price, _.bind(process))
    } else {
      minimum = this.getMinimum(price)
      process(undefined, { amount: amount, price: price })
    }
  }



}

module.exports = Order;