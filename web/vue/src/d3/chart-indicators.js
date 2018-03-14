import _ from 'lodash'
import techan from 'techan'

// techanjs based cancle chart, unused at the moment

export default function(_candles, _trades, _indicators) {
	let MAX_WIDTH = window.innerWidth;

	var margin = {
			top: 20,
			right: 20,
			bottom: 20,
			left: 50
		},

		width = MAX_WIDTH - margin.left - margin.right,
		height = 300,
		height2 = 100,
		height3 = 100,
		height4 = 100;

	//adding graphs with different scales

	var x = techan.scale.financetime()
		.range([0, width]);

	var xI = d3.scaleUtc().range([0, width]);

	var x2 = techan.scale.financetime()
		.range([0, width]);

    var x4 = techan.scale.financetime()
        .range([0, width]);


	var y = d3.scaleLinear()
		.range([height, 0]);

	var yVolume = d3.scaleLinear()
		.range([y(0), y(0.3)]);

	var yIndicatorTest = d3.scaleLinear()
		.range([height, 0]);

	var y2 = d3.scaleLinear()
		.range([height2, 0]);

	var y3 = d3.scaleLinear()
		.range([height3, 0]);


    var y4 = d3.scaleLinear()
        .range([height4, 0]);


	var brush = d3.brushX()
		.extent([
			[0, 0],
			[width, height2]
		])
		.on("brush end", brushed);


	var candlestick = techan.plot.candlestick()
		.xScale(x)
		.yScale(y);

	var volume = techan.plot.volume()
		.xScale(x)
		.yScale(yVolume);

	var tradearrow = techan.plot.tradearrow()
		.xScale(x)
		.yScale(y)
		.orient(function(d) {
			return d.type.startsWith("buy") ? "up" : "down";
		})
		.on("mouseenter", enter)
		.on("mouseout", out);

	var indicatorGraph1 = techan.plot.close()
		.xScale(x)
		.yScale(y3);

    var indicatorGraph2 = techan.plot.close()
        .xScale(x)
        .yScale(y3);

	var close = techan.plot.close()
		.xScale(x2)
		.yScale(y2);

	var indicatorLong = techan.plot.close()
		.xScale(x)
		.yScale(y);

	var indicatorShort = techan.plot.close()
		.xScale(x)
		.yScale(y);



	var xAxis = d3.axisBottom(x);

	var xAxis2 = d3.axisBottom(x2);

    var xAxis4 = d3.axisBottom(x2);

	var yAxis = d3.axisLeft(y);

	var yAxis2 = d3.axisLeft(y2)
		.ticks(6);

	var yAxis3 = d3.axisLeft(y3)
		.ticks(3);

    var yAxis4 = d3.axisLeft(y4)
        .ticks(3);



	var ohlcAnnotation = techan.plot.axisannotation()
		.axis(yAxis)
		.orient('left')
		.format(d3.format(',.2f'));

	var timeAnnotation = techan.plot.axisannotation()
		.axis(xAxis)
		.orient('bottom')
		.format(d3.timeFormat('%Y-%m-%d %H:%M'))
		.width(120)
		.translate([0, height]);

	var crosshair = techan.plot.crosshair()
		.xScale(x)
		.yScale(y)
		.xAnnotation(timeAnnotation)
		.yAnnotation(ohlcAnnotation);



	var svg = d3.select("#chart").append("svg")
		.attr("width", window.innerWidth - 20)
		.attr("height", height + height2 + height3 + height4 + margin.top * 4 + margin.bottom * 4); //this should be calculated

	var focus = svg.append("g")
		.attr("class", "focus")
		.attr("transform", "translate(" + margin.left + "," + (height2 + margin.top * 2 + margin.bottom) + ")");

	focus.append("text")
		.attr("x", (width / 2))
		.attr("y", 0 - (margin.top / 2))
		.attr("text-anchor", "middle")
		.style("font-size", "12px")
		.style("text-decoration", "none")
		.text("Market Graph (Heikin-Ashi)");

	focus.append("clipPath")
		.attr("id", "clip")
		.append("rect")
		.attr("x", y(1))
		.attr("y", 0)
		.attr("width", width)
		.attr("height", y(0) - y(1));
	console.log("heightclip", y(0) - y(1));

	focus.append("g")
		.attr("class", "volume")
		.attr("clip-path", "url(#clip)");

	focus.append("g")
		.attr("class", "candlestick")
		.attr("clip-path", "url(#clip)");

	focus.append("g")
		.attr("class", "tradearrow")
		.attr("clip-path", "url(#clip)");

	var valueText = svg.append('text')
		.style("text-anchor", "end")
		.attr("class", "coords")
		.attr("x", width - 5)
		.attr("y", 15);

	focus.append("g")
		.attr("class", "indicatorLong")
		.attr("clip-path", "url(#clip)");

	focus.append("g")
		.attr("class", "indicatorShort")
		.attr("clip-path", "url(#clip)");



	focus.append("g")
		.attr("class", "x axis")
		.attr("transform", "translate(0," + height + ")");

	focus.append("g")
		.attr("class", "y axis")
		.append("text")
		.attr("transform", "rotate(-90)")
		.attr("y", 0)
		.attr("dy", ".71em")
		.style("text-anchor", "end")
		.text("Price ($)");

	focus.append('g')
		.attr("class", "crosshair")
		.call(crosshair);

	var context = svg.append("g")
		.attr("class", "context")
		.attr("transform", "translate(" + margin.left + "," + margin.top + ")");

	context.append("text")
		.attr("x", (width / 2))
		.attr("y", 0 - (margin.top / 2))
		.attr("text-anchor", "middle")
		.style("font-size", "12px")
		.style("text-decoration", "none")
		.text("Close Price");




	context.append("g")
		.attr("class", "close");

	context.append("g")
		.attr("class", "pane");


	context.append("g")
		.attr("class", "x axis")
		.attr("transform", "translate(0," + height2 + ")");

	context.append("g")
		.attr("class", "y axis")
		.call(yAxis2)





	//add a graph
	var indicator1 = svg.append("g")
		.attr("class", "indicator1")
		.attr("transform", "translate(" + margin.left + "," + (height + height2 + margin.top * 3 + margin.bottom * 2) + ")");
	indicator1.append("text")
		.attr("x", (width / 2))
		.attr("y", 0 - (margin.top / 2))
		.attr("text-anchor", "middle")
		.style("font-size", "12px")
		.style("text-decoration", "none")
		.text("ADX");
	indicator1.append("g")
		.attr("class", "indicatorGraph1")
		.attr("clip-path", "url(#clip)")
		.attr("fill", "none")
		.attr("stroke", "black")
		.attr("stroke-width", "1px");

	indicator1.append("g")
		.attr("class", "pane");

	indicator1.append("g")
		.attr("class", "x axis")
		.attr("transform", "translate(0," + height3 + ")");

	indicator1.append("g")
		.attr("class", "y3 axis")
		.call(yAxis3
			.tickSize(-width)
		);


	var indicator2 = svg.append("g")
		.attr("class", "indicator2")
		.attr("transform", "translate(" + margin.left + "," + (height + height2 + height3 + margin.top * 4 + margin.bottom * 3) + ")");
	indicator2.append("text")
		.attr("x", (width / 2))
		.attr("y", 0 - (margin.top / 2))
		.attr("text-anchor", "middle")
		.style("font-size", "12px")
		.style("text-decoration", "none")
		.text("Stoch RSI");
	indicator2.append("g")
		.attr("class", "indicatorGraph2")
		.attr("clip-path", "url(#clip)")
		.attr("fill", "none")
		.attr("stroke", "black")
		.attr("stroke-width", "1px");

	indicator2.append("g")
		.attr("class", "pane");

	indicator2.append("g")
		.attr("class", "x axis")
		.attr("transform", "translate(0," + height4 + ")");

	indicator2.append("g")
		.attr("class", "y3 axis")
		.call(yAxis3
			.tickSize(-width)
		);



	var accessor = candlestick.accessor();

	const data = _candles.map(function(d) {
		return {
			date: new Date(d.start),
			open: +d.open,
			high: +d.high,
			low: +d.low,
			close: +d.close,
			volume: +d.volume
		};
	}).sort(function(a, b) {
		return d3.ascending(accessor.d(a), accessor.d(b));
	});

	const trades = _trades.map(function(t) {
		let trade = _.pick(t, ['price']);
		trade.quantity = 1;
		trade.type = t.action;
		trade.date = new Date(t.date);
		return trade;
	});

	const indicatorLongData = _indicators.maSlow.map(m => {
		var value = (!m.result.result ? 0 : m.result.result)
		return {
			close: value,
			date: moment.utc(m.date).toDate()
		}
	});

	const indicatorShortData = _indicators.maFast.map(m => {
		var value = (!m.result.result ? 0 : m.result.result)
		return {
			close: value,
			date: moment.utc(m.date).toDate()
		}
	});


	var indicatorGraph1Accessor = indicatorGraph1.accessor();
	const indicatorGraph1Data = _indicators.ADX.map(function(d) {
		var value = (!d.result.result ? 0 : d.result.result)
		return {
			open: value,
			high: value,
			low: value,
			close: value,
			date: moment.utc(d.date).toDate()
		}
	})
    //.sort(function(a, b) { return d3.ascending(indicatorGraph1Accessor.d(a), indicatorGraph1Accessor.d(b));})


    var indicatorGraph2Accessor = indicatorGraph2.accessor();
    const indicatorGraph2Data = _indicators.StochRSI.map(function(d) {
        var value = (!d.result.result.result ? 0 : d.result.result.result)
        //console.log("STOCH RSI VALUE",value)
        return {
            close: value,
            date: moment.utc(d.date).toDate()
        }
    });




	//console.log(indicators,trades);

	x.domain(data.map(accessor.d));
	xI.domain(d3.extent(data, function(d) {
		return d.date;
	}));
	y.domain(techan.scale.plot.ohlc(data, accessor).domain());
	yVolume.domain(techan.scale.plot.volume(data).domain());
	yIndicatorTest.domain(y.domain());

	x2.domain(x.domain());
	y2.domain(y.domain());
	//y3.domain(techan.scale.plot.ohlc(indicatorGraph1Data, accessor).domain());

	focus.select("g.volume").datum(data);
	focus.select("g.tradearrow").datum(trades);
	focus.select("g.candlestick").datum(data);


	y3.domain(techan.scale.plot.ohlc(indicatorGraph1Data, accessor).domain());
	indicator1.select("g.indicatorGraph1").datum(indicatorGraph1Data).call(indicatorGraph1);
	//indicator1.select("g.x.axis").call(xAxis);


    y4.domain(techan.scale.plot.ohlc(indicatorGraph2Data, accessor).domain());
    indicator2.select("g.indicatorGraph2").datum(indicatorGraph2Data).call(indicatorGraph2);


	focus.select("g.indicatorLong").datum(indicatorLongData);
	focus.select("g.indicatorShort").datum(indicatorShortData);


	context.select("g.close").datum(data).call(close);
	context.select("g.x.axis").call(xAxis2);
	context.select("g.y.axis").call(yAxis2);

	context.select("g.pane").call(brush).selectAll("rect").attr("height", height2);


	x.zoomable().domain(x2.zoomable().domain());

	draw();

	// Associate the zoom with the scale after a domain has been applied
	// Stash initial settings to store as baseline for zooming
	//zoomableInit = x.zoomable().clamp(false).copy();

	function brushed() {
		var zoomable = x.zoomable(),
			zoomable2 = x2.zoomable();

		zoomable.domain(zoomable2.domain());
		if (d3.event.selection !== null) zoomable.domain(d3.event.selection.map(zoomable.invert));
		draw();
	}

	function draw() {
		//console.log(indicatorGraph1);
		var candlestickSelection = focus.select("g.candlestick"),
			data = candlestickSelection.datum();
		y.domain(techan.scale.plot.ohlc(data.slice.apply(data, x.zoomable().domain()), candlestick.accessor()).domain());
		y2.domain(y.domain());
		//y3.domain(techan.scale.plot.ohlc(indicatorGraph1Data.slice.apply(indicatorGraph1Data, x.zoomable().domain()), indicatorGraph1.accessor()).domain());
		focus.select("g.volume").call(volume);

		candlestickSelection.call(candlestick);
		focus.select("g.tradearrow").call(tradearrow);
		// using refresh method is more efficient as it does not perform any data joins
		// Use this if underlying data is not changing
		//        svg.select("g.candlestick").call(candlestick.refresh);


		indicator1.select("g.indicatorGraph1").call(indicatorGraph1);
		indicator1.select("g.x.axis").call(xAxis);
		indicator1.select("g.y3.axis").call(yAxis3);


        indicator2.select("g.indicatorGraph2").call(indicatorGraph2);
        indicator2.select("g.x4.axis").call(xAxis4);
        indicator2.select("g.y4.axis").call(yAxis4);


		//indicator1.select("g.y.axis").call(yAxis3);
		focus.select("g.indicatorLong").call(indicatorLong);
		focus.select("g.indicatorShort").call(indicatorShort);

		//context.select("g.x.axis").call(xAxis2);
		//context.select("g.y.axis").call(yAxis2);

		focus.select("g.x.axis").call(xAxis);
		focus.select("g.y.axis").call(yAxis);
	}

	function enter(d) {
		valueText.style("display", "inline");
		refreshText(d);
	}

	function out() {
		valueText.style("display", "none");
	}

	function refreshText(d) {
		valueText.text("Trade: " + dateFormat(d.date) + ", " + d.type + ", " + valueFormat(d.price));
	}

};