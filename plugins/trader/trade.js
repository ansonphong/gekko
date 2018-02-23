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

    // store all the order objects
    this.orders = []

    this.assetAmountTraded = 0
    this.assetBalance = 0

    this.isActive = true
    this.doTrade()
  }

  deinit(callback,param){

    var done = () => {
      this.isActive = false
      if(callback)
        callback(param)
    }.bind(this)

    let activeOrders = _.where(this.orders, {stat:"open"})
    if(activeOrders.length > 0)
      this.cancelOrders(activeOrders,done)
    else
      done()
  }

  getOrderSettings(){
    return {

    }
  }

  newOrder(settings){

    // TODO : make option for settings to be an array
    // if it's an array, fun foreach on the settings and create multiple orders

    let makeNewOrder = () => {
      let newOrder = new Order(this,{}) // TODO : get order settings - method?
      this.orders.push(newOrder)
      return newOrder
    }.bind(this)

    async.series([
      this.manager.setTicker,
      this.manager.setPortfolio,
      this.manager.setFee
    ], makeNewOrder); // ??>> _.bind(makeNewOrder, this)

  }


  checkActiveOrders(callback){
    // check to see if the bid/ask is the same, calculate offset
    // if the order needs updating, due to slippage, cancel

    if(!validOrder)
      this.cancelCurrentOrder(callback)

      // ...
      // run the callback with result, boolean, true if valid, false if invalid
      callback(res)

  }


  cancelOrders(orders,callback){

    // get all orders which are stat ACTIVE and cancel them
    // after all are cancelled successfully, then callback
    // async series on order.cancel() for each

    // !TODO : bind the function to this
    // - ASYNC for each "orders" run cancel

    // _.filter(list, predicate, [context])
    // _.where(this.orders, {stat:"open"})

    XXX.cancel((res) => {
      if(res === true){
        // TODO : log how much of the order was filled
        
        callback()
      }
      else{
        
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

  // all up all the order amounts and compare to the initial price
  getAverageSlippage(){
    
  }

  // add up all orders in the order history and get weighted average
  getAverageTradePrice(){
    
  }

  // add up all amounts filled in the order history
  getAssetAmountTraded(){
    
  }

  logOrderSummary(){
    log.info(
        'So far, traded',
        this.getAssetAmountTraded(),
        this.manager.asset,
        'for approx',
        (this.getAssetAmountTraded() * this.getAverageTradePrice()),
        this.manager.currency,
        'Approx average price:',
        this.getAverageTradePrice()
      )
  }

  orderUpdated(order){
    // process the order updated status
    // if it's been filled, deal with it, if it's ...
  }

}

module.exports = Trade