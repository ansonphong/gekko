var log = require('../../core/log.js')
var EMA = require('./EMA')
var RSI = require('./RSI')
var _ = require('lodash');

var defaultConfig = {
  rsiInterval: 14,
  stochInterval: 14,
  emaInterval: 3
}

module.exports = class StochRSI{
  constructor(config){
    if(!config)
      config = defaultConfig
    this.input = 'candle'
    this.stochInterval = config.stochInterval
    this.rsi = new RSI({interval:config.rsiInterval})
    this.ema = new EMA(config.emaInterval)
    this.rsiHistory = []
    this.result = {
      result:0,
      stochRsi: 0,
      ema: 0,
      rsi:0
    }
  }

  update(candle){
    // update sub-indicators
    this.rsi.update(candle)
    this.result.rsi = this.rsi.result

    // calculate and set the Stoch RSI
    let stochRsi = this.calcStochRsi()
    if(!stochRsi)
      stochRsi = 0
    this.result.stochRsi = stochRsi
    this.result.result = stochRsi

    // calculate the EMA of the Stoch RSI
    this.ema.update(stochRsi)
    this.result.ema = this.ema.result
  }

  calcStochRsi(){
    this.rsiHistory.push(this.rsi.result)
    // keep the length of the history no more than the stoch interval
    if(_.size(this.rsiHistory) > this.stochInterval)
      // remove oldest RSI value
      this.rsiHistory.shift()
    this.lowestRsi = _.min(this.rsiHistory)
    this.highestRsi = _.max(this.rsiHistory)
    return ((this.rsi.result - this.lowestRsi) / (this.highestRsi - this.lowestRsi)) * 100
  }
}
