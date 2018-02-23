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

  TODO : 
  - Do not cancel existing order if it's going to place at the same amount

*/

/*
  The Trade class is responsible for overseeing potentially multiple orders
  to execute a trade that completely moves a position.
*/

var _ = require('lodash')
var util = require('../../core/util')
var dirs = util.dirs()
var events = require('events')
var log = require(dirs.core + 'log')
var async = require('async')
var checker = require(dirs.core + 'exchangeChecker.js')
var moment = require('moment')
var Order = require('./order')

class Trade{
  constructor(manager,settings){
    this.manager = manager
    this.exchange = manager.exchange

    this.action = settings.action // BUY/SELL
    this.stat = "unfilled" // unfilled/partial/filled/cancelled

    // inherit manager properties
    this.currencyAllowance = this.manager.currencyAllowance
    this.keepAsset = this.manager.keepAsset

    // used to calculate slippage across multiple orders
    this.initPrice = 0
    // keep averages of the executed trade
    this.averagePrice = 0
    this.averageSlippage = 0

    this.currentOrder = false
    this.orderHistory = []

    this.manager.assetAmountTraded = 0
    this.lastAssetBalance = 0

    this.isActive = true
    this.doTrade()
  }


  deinit(callback,param){
    this.isActive = false

    var done = () => {
      this.manager.tradeHistory.push(this)
      this.manager.currentTrade = false
      if(callback)
        callback(param)
    }

    if(this.currentOrder)
      this.currentOrder.cancel(done)
    else
      done()
  }

  newOrder(settings){
    // async series - get current bid/ask, create new order
    //this.orderHistory.push(this.currentOrder)
    return this.currentOrder = new Order(this,settings)
  }


  validateCurrentOrder(callback){
    // check to see if the bid/ask is the same, calculate offset
    // if the order needs updating, due to slippage, cancel

    if(!validOrder)
      this.cancelCurrentOrder(callback)

      // ...
      // run the callback with result, boolean, true if valid, false if invalid
      callback(res)

  }


  cancelCurrentOrder(callback){
    this.currentOrder.cancel((res) => {
      if(res === true){
        // TODO : log how much of the order was filled
        log.info("successfully cancelled order:", this.currentOrder.txid)
        this.orderHistory.push(this.currentOrder)
        this.currentOrder = false
      }
      else{
        // if order was not cancelled, reschedule it
        setTimeOut(this.cancelCurrentOrder(callback),2000)
      }
    })
  }


  doTrade(){
    if(this.currentOrder)
      this.validateCurrentOrder((res) => {
        if(res === false)
          this.cancelCurrentOrder(this.doTrade())
      })
    else
      this.newOrder()
  }


  setInitPrice(price){
    if(this.initPrice === 0)
      this.initPrice = price
  }


  // the change in asset balance at the exchange is used to
  // check whether the last attempt was partially filled
  // this method is liable to err if assets withdrawn or deposited
  // during a prolonged trade attempt involving many retries
  isPartiallyFilled(){
    return (this.attempts > 1 && this.manager.getBalance(this.manager.asset) != this.lastAssetBalance)
  }

  getLastOrderId(){
    return _.last(this.orderHistory).id
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
      )
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


  noteOrder(err, order) {
    if(err) {
      util.die(err)
    }

    // TODO : remove this
    this.orders.push(order)

    this.currentTrade.orders.push(order)

    /*
    this.currentTrade.orders.push({
      txid: order,
      amount: this.lastOrder.amount,
      price: this.lastOrder.price,
      filledAmount: 0
    })
    */


    // If unfilled, cancel and replace order with adjusted price
    let cancelDelay = this.conf.orderUpdateDelay || 1
    setTimeout(this.checkOrder, util.minToMs(cancelDelay))
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




}

module.exports = Trade