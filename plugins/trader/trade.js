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
    
    this.currencyAmount = trade.currencyAmount
    this.assetAmount = trade.assetAmount
    
    // used to calculate slippage
    this.initPrice = trade.initPrice 

    this.currencyAllowance = trade.currencyAllowance
    this.keepAsset = trade.keepAsset

    this.averagePrice = 0
    this.averageSlippage = 0

    this.activeOrder = {
      id: 0,
      currencyAmount: 0,
      assetAmount: 0,
      price: 0,
      slippage: 0,
      offset: 0
    }

    this.orders = []

    this.try = 1

  }

  getLastOrderId(){
    return _.last(this.orders).id
  }

  getAverageSlippage(){
    // all up all the order amounts and compare to the initial price
  }

  getAveragePrice(){
    // add up all orders in the order history and get weighted average
  }

  getAmountFilled(){
    // add up all amounts filled in the order history
  }

}

module.exports = Trade;