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
*/

class Order{
  constructor(trade,settings){
    this.trade = trade // store a referrence to the parent trade
    this.exchange = this.trade.manager.exchange

    this.txid = false // id of this order on the exchange
    this.type = "limit" // limit/market
    this.stat = "active" // active/filled/cancelled

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

  }


  // update data from the exchange
  update(){
    if(this.txid)
      this.exchange.getOrder(this.txid, (res) => {
        this.assetAmountFilled = res.amount
        this.scheduleUpdate()
      })
  }

  scheduleUpdate(){
    // set timeout to tick, run update
  }

  cancel(callback){

    // then
      this.currentOrder.stat = "cancelled"
      
      callback(res)

  }

}

module.exports = Order;