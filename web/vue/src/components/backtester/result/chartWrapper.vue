<template lang='jade'>
#chartWrapper(v-bind:class='{ clickable: !isClicked }')
  .shield(v-on:click.prevent='click')
  svg#chart(width='960', :height='height')
</template>

<script>

import chart from '../../../d3/chart-indicators'
import { draw as drawMessage, clear as clearMessage } from '../../../d3/message'

const MIN_CANDLES = 4;

export default {
  props: ['data', 'height'],

  data: function() {
    return {
      isClicked: false
    }
  },

  watch: {
    data: function() { this.render() },
  },

  created: function() { setTimeout( this.render, 100) },
  beforeDestroy: function() {
    this.remove();
  },

  methods: {
    click: function() {
      this.isClicked = true;
    },
    render: function() {
      this.remove();


      if(_.size(this.data.candles) < MIN_CANDLES) {
        drawMessage('Not enough data to spawn chart');
      } else {
        chart(this.data.candles, this.data.trades, this.data.indicatorResults);
      }
    },
    remove: function() {
      d3.select('#chart').html('');
    }
  }
}
</script>

<style>

#chartWrapper.clickable {
  position: relative;
}

#chartWrapper.clickable .shield {
  cursor: zoom-in;
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  background: white;
  opacity: 0.1;
}

#chart {
  background-color: #fff;
  width: 100%;
  font: 10px sans-serif;
}

#chart circle {
  clip-path: url(#clip);
}

#chart .zoom {
  cursor: move;
  fill: none;
  pointer-events: all;
}

#chart .y3.axis line {
  stroke: red;
  stroke-opacity: 0.7;
  shape-rendering: crispEdges;
}

#chart .indicatorLong {
  stroke: blue;
  fill: none;
  stroke-width: 1.5px;
  clip-path: url(#clip);
}

#chart .indicatorShort {
fill: none;
stroke: orange;
  stroke-width: 1.5px;
  clip-path: url(#clip);
}

#chart .close {
  stroke: red;
  fill: none;
  stroke-width: 1.5px;
  clip-path: url(#clip);
}


/*
#chart .indicatorDiff {
  stroke: black;
  fill: #FF0000;
  stroke-width: 3px;
  clip-path: url(#clip);
}
*/




#chart circle.buy {
  fill: #7FFF00;
}

#chart circle.sell {
  fill: red;
}

path.candle.up {
    fill: #00AA00;
    stroke: #00AA00;
}

path.candle.down {
    fill: #FF0000;
    stroke: #FF0000;
}
path.tradearrow {
        stroke: #000000;
        stroke-width: 2;

    }

path.tradearrow.buy {
    fill: #0000FF;
}

path.tradearrow.buy-pending {
    fill-opacity: 0.2;
    stroke: #0000FF;
    stroke-width: 1.5;
}

path.tradearrow.sell {
    fill: #9900FF;
}

.tradearrow path.highlight {
    fill: none;
    stroke-width: 10;
}

.tradearrow path.highlight.buy,.tradearrow path.highlight.buy-pending {
    stroke: #0000FF;
}

.tradearrow path.highlight.buy-pending {
    fill: #0000FF;
    fill-opacity: 0.3;
}

.tradearrow path.highlight.sell {
    stroke: #9900FF;
}

path.volume {
        fill: #cccccc;
}


path.pane {
    fill: #fff;

}

.extent {
    stroke: #000;
    fill-opacity: .125;
    shape-rendering: crispEdges;
}

.crosshair {
    cursor: crosshair;
}

.crosshair path.wire {
    stroke: #777777;
    stroke-dasharray: 1, 1;
}

.crosshair .axisannotation path {
    fill: #DDDDDD;
}

</style>
