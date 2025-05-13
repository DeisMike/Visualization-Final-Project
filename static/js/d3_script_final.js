// Scales, brush, dispatch for linking
const dispatcher = d3.dispatch('filter', 'dimensionChanged', 'resetPCP');
let currentFilter = null;
let data; 
let brushBar, brushHist, brushScatter, brushPCP, brushArea;

(async function() {
    const res = await fetch('/api/data');
    const { songs, pca_explained, mds_coords } = await res.json();
    const data = songs.map(d => {
        // coerce numeric
        return{
            ...d,
            Release_year: +d.release_year,
            Followers: +d.followers,
            Artist_popularity: +d.artist_popularity,
            Song_popularity: +d.song_popularity,
            Duration_sec: +d.duration_sec,
            Acousticness: +d.acousticness,
            Danceability: +d.danceability,
            Energy: +d.energy,
            Instrumentalness: +d.instrumentalness,
            Liveness: +d.liveness,
            Loudness: +d.loudness,
            Speechiness: +d.speechiness,
            Valence: +d.valence,
            Tempo: +d.tempo
        };
    });

    // append a single hidden tooltip div to the page
    const tooltip = d3.select('body')
        .append('div')
            .attr('class', 'tooltip')
            .style('position', 'absolute')
            .style('pointer-events', 'none')
            .style('background', 'rgba(255,255,255,0.9)')
            .style('padding', '6px 8px')
            .style('border', '1px solid #aaa')
            .style('border-radius', '4px')
            .style('font-size', '12px')
            .style('opacity', 0);


    // Bar chart
    function drawBar(attr, dataArray = data) {
        // if nothing to draw, bail out
        if(!dataArray || dataArray.length === 0) {
            // 1) Clear old
            const container = d3.select('#bar-chart');
            container.select('svg').remove();

            container.append('div')
                .attr('class', 'no-data')
                .text('No data to display');
            return;
        }
        // 1) Clear old
        const container = d3.select('#bar-chart');
        container.select('svg').remove();
        // Setup and sizing
        const margin = {top: 20, right: 20, bottom: 70, left: 40};
        const W = parseInt(container.style('width'))  - margin.left - margin.right;
        const H = parseInt(container.style('height')) - margin.top  - margin.bottom;
        // create SVG
        const svg = container.append('svg')
            .attr('width',  W + margin.left + margin.right)
            .attr('height', H + margin.top  + margin.bottom)
            .append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);
        // group & count
        // d3.rollup returns a Map; convert to array of {key, value}
        const counts = Array.from(
            d3.rollup(dataArray, v => v.length, d => d[attr]),
            ([key, value]) => ({key, value})
        )
        .sort((a, b) => b.value - a.value); // sort by descending value

        // Scales & Axes
        const x = d3.scaleBand()
            .domain(counts.map(d => d.key))
            .range([0, W])
            .padding(0.1);
        const y = d3.scaleLinear()
            .domain([0, d3.max(counts, d => d.value)])
            .nice()
            .range([H, 0]);
        
        svg.append('g')
            .attr('transform', `translate(0,${H})`)
            .call(d3.axisBottom(x)).selectAll('text')
                .attr('text-anchor', 'end')
                .attr('transform', 'rotate(-45)')
                .attr('dx', '-0.6em')
                .attr('dy', '0.1em');
        
        svg.append('g')
            .call(d3.axisLeft(y));

        // Bars, title, axis labels
        svg.selectAll('.bar')
            .data(counts, d => d.key)
            .enter().append('rect')
                .attr('class', 'bar')
                .attr('x', d => x(d.key))
                .attr('y', d => y(d.value))
                .attr('width', x.bandwidth())
                .attr('height', d => H - y(d.value))
                .attr('fill', 'steelblue');

        svg.append('text')
            .attr("x", (W / 2) - margin.left + 40)
            .attr("y", 0 - ((margin.top - 10) / 2))
            .attr("text-anchor", "middle")
            .style("font-size", "16px")
            .style("text-decoration", "underline")
            .text(`Distribution of Songs by ${attr} `);

        // Add x-axis label
        svg.append("text")
            .attr("x", W / 2)
            .attr("y", H + margin.bottom - 30)
            .style("text-anchor", "middle")
            .text(attr);

        // Add y-axis label
        svg.append("text")
            .attr("transform", `translate(${-margin.left +
                20},${H / 2}) rotate(-90)`)
            .style("text-anchor", "middle")
            .text("Number of songs");
        
        // Brushing
        brushBar = d3.brushX()
            .extent([[0, 0], [W, H]])
            .on('end', ({selection}) => {
                let selectedCats;
                if (selection) {
                    const [x0, x1] = selection;
                    selectedCats = counts.filter(d => {
                        const cx = x(d.key) + x.bandwidth() / 2;
                        return x0 <= cx && cx <= x1;
                    })
                    .map(d => d.key);
                } else {
                    // no selection -> all categories
                    selectedCats = counts.map(d => d.key);
                }

                // grab all Song_ids in those categories
                const selectedIDs = dataArray.filter(d => selectedCats.includes(d[attr])).map(d => d.song_id);

                // fire the global filter event
                dispatcher.call('filter', null, selectedIDs);
            });

        svg.append('g')
            .attr('class', 'brush')
            .call(brushBar);

        // notify other charts that the dimension changed
        dispatcher.call('dimensionChanged', null, attr);
    }

    // Histogram
    function drawHist(attr, dataArray = data) {
        // if nothing to draw, bail out
        if(!dataArray || dataArray.length === 0) {
            // 1) Clear old
            const container = d3.select('#histogram');
            container.select('svg').remove();

            container.append('div')
                .attr('class', 'no-data')
                .text('No data to display');
            return;
        }
        // 1) Clear old
        const container = d3.select('#histogram');
        container.select('svg').remove();

        // Set up margins and inner width/height
        const margin = { top: 20, right: 20, bottom: 50, left: 40 };
        const W = parseInt(container.style('width'))  - margin.left - margin.right;
        const H = parseInt(container.style('height')) - margin.top  - margin.bottom;

        // Append SVG & group
        const svg = container.append('svg')
            .attr('width',  W + margin.left + margin.right)
            .attr('height', H + margin.top  + margin.bottom)
            .append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        // X scale: numeric domain of your chosen attribute
        const x = d3.scaleLinear()
            .domain(d3.extent(dataArray, d => +d[attr]))
            .nice()
            .range([0, W]);

        // Create bins
        const binGenerator = d3.bin()
            .value(d => +d[attr])
            .domain(x.domain())
            .thresholds(20);
        const bins = binGenerator(dataArray);

        // Y scale: count of items in each bin
        const y = d3.scaleLinear()
            .domain([0, d3.max(bins, b => b.length)])
            .nice()
            .range([H, 0]);

        // Draw axes
        svg.append('g')
            .attr('transform', `translate(0,${H})`)
            .call(d3.axisBottom(x));
        svg.append('g')
            .call(d3.axisLeft(y));

        // Add title
        svg.append('text')
            .attr('x', (W / 2) - margin.left + 40)
            .attr('y', 0 - ((margin.top - 10) / 2))
            .attr('text-anchor', 'middle')
            .style('font-size', '16px')
            .style('text-decoration', 'underline')
            .text(`Distribution of Songs by ${attr}`);

        // Axis labels
        svg.append('text')
            .attr('x',  W / 2)
            .attr('y',  H + margin.bottom - 10)
            .attr('text-anchor', 'middle')
            .text(attr);

        svg.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('x', -H / 2)
            .attr('y', -margin.left + 15)
            .attr('text-anchor', 'middle')
            .text('Count');

        // Draw bars
        svg.selectAll('.bar')
            .data(bins)
            .enter().append('rect')
            .attr('class', 'bar')
            .attr('x', d => x(d.x0) + 1)
            .attr('y', d => y(d.length))
            .attr('width', d => Math.max(0, x(d.x1) - x(d.x0) - 1))
            .attr('height',d => H - y(d.length))
            .attr('fill','steelblue');

        // Add brush for linked‐filtering
        brushHist = d3.brushX()
            .extent([[0, 0], [W, H]])
            .on('end', event => {
                let selected = dataArray;
                if (event.selection) {
                const [x0, x1] = event.selection;
                const d0 = x.invert(x0), d1 = x.invert(x1);
                selected = dataArray.filter(d => {
                    const v = +d[attr];
                    return v >= d0 && v <= d1;
                });
                }
                const selectedIDs = selected.map(d => d.song_id);
                dispatcher.call('filter', null, selectedIDs);
            });

        svg.append('g')
            .attr('class', 'brush')
            .call(brushHist);

        // Notify other charts if the numeric dimension changed
        dispatcher.call('dimensionChanged', null, attr);
    }

    // Scatterplot (handles three cases)
    function drawScatter(xAttr, yAttr, dataArray = data) {
        // if nothing to draw, bail out
        if(!dataArray || dataArray.length === 0) {
            // 1) Clear old
            const container = d3.select('#scatterplot');
            container.select('svg').remove();

            container.append('div')
                .attr('class', 'no-data')
                .text('No data to display');
            return;
        }
        // 1) Clear old
        const container = d3.select('#scatterplot');
        container.select('svg').remove();

        // 2) Margins and full size
        const margin = { top: 20, right: 20, bottom: 50, left: 60 };
        const W = parseInt(container.style('width'))  - margin.left - margin.right;
        const H = parseInt(container.style('height')) - margin.top  - margin.bottom;

        // 3) SVG root
        const svg = container.append('svg')
            .attr('width',  W + margin.left + margin.right)
            .attr('height', H + margin.top  + margin.bottom)
            .append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        // 4) Type detection
        const xIsNum = typeof dataArray[0][xAttr] === 'number';
        const yIsNum = typeof dataArray[0][yAttr] === 'number';

        // 5) Scales
        let xScale, yScale;
        if (xIsNum) {
            xScale = d3.scaleLinear()
            .domain(d3.extent(dataArray, d => d[xAttr])).nice()
            .range([0, W]);
        } else {
            const xDomain = Array.from(new Set(dataArray.map(d => d[xAttr])));
            xScale = d3.scaleBand()
            .domain(xDomain)
            .range([0, W])
            .padding(0.2);
        }

        if (yIsNum) {
            yScale = d3.scaleLinear()
            .domain(d3.extent(dataArray, d => d[yAttr])).nice()
            .range([H, 0]);
        } else {
            const yDomain = Array.from(new Set(dataArray.map(d => d[yAttr])));
            yScale = d3.scaleBand()
            .domain(yDomain)
            .range([H, 0])
            .padding(0.2);
        }

        // 6) Axes
        svg.append('g')
            .attr('transform', `translate(0,${H})`)
            .call(xIsNum ? d3.axisBottom(xScale) : d3.axisBottom(xScale))
            .selectAll('text')
            .attr('transform', 'rotate(-45)')
            .attr('text-anchor', 'end')
            .attr('dx', '-0.6em')
            .attr('dy', '0.1em');

        svg.append('g')
            .call(yIsNum ? d3.axisLeft(yScale) : d3.axisLeft(yScale));

        // Add title
        svg.append('text')
            .attr('x', (W / 2) - margin.left + 40)
            .attr('y', 0 - ((margin.top - 10) / 2))
            .attr('text-anchor', 'middle')
            .style('font-size', '16px')
            .style('text-decoration', 'underline')
            .text(`Scatterplot of ${yAttr} vs ${xAttr}`);

        // 7) Axis labels
        svg.append('text')
            .attr('x', W / 2)
            .attr('y', H + margin.bottom - 10)
            .attr('text-anchor', 'middle')
            .text(xAttr);

        svg.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('x', -H / 2)
            .attr('y', -margin.left + 15)
            .attr('text-anchor', 'middle')
            .text(yAttr);

        // 8) Draw points / overplots
        if (xIsNum && yIsNum) {
            // simple scatter
            svg.selectAll('circle')
            .data(dataArray)
            .enter().append('circle')
                .attr('cx', d => xScale(d[xAttr]))
                .attr('cy', d => yScale(d[yAttr]))
                .attr('r', 3)
                .attr('fill', 'steelblue')
                .attr('opacity', 0.7)
                // show tooltip of song, artist name
                .on('mouseover', (event, d) => {
                    tooltip
                        .html(`<strong>${d.song_name}</strong><br/>${d.artist}`)
                        .style('opacity', 1);
                })
                // move it with the mouse cursor
                .on('mousemove', event => {
                    tooltip
                        .style('left', (event.pageX + 10) + 'px')
                        .style('top', (event.pageY + 10) + 'px');
                })
                // hide on exit
                .on('mouseout', () => {
                    tooltip.style('opacity', 0);
                });

        } else if (xIsNum && !yIsNum) {
            // numeric X vs categorical Y: strip + jitter along Y
            const jitter = yScale.bandwidth() * 0.7;
            svg.selectAll('circle')
            .data(dataArray)
            .enter().append('circle')
                .attr('cx', d => xScale(d[xAttr]))
                .attr('cy', d =>
                yScale(d[yAttr])
                + yScale.bandwidth()/2
                + (Math.random() - 0.5) * jitter
                )
                .attr('r', 3)
                .attr('fill', 'steelblue')
                .attr('opacity', 0.7)
                // show tooltip of song, artist name
                .on('mouseover', (event, d) => {
                    tooltip
                        .html(`<strong>${d.song_name}</strong><br/>${d.artist}`)
                        .style('opacity', 1);
                })
                // move it with the mouse cursor
                .on('mousemove', event => {
                    tooltip
                        .style('left', (event.pageX + 10) + 'px')
                        .style('top', (event.pageY + 10) + 'px');
                })
                // hide on exit
                .on('mouseout', () => {
                    tooltip.style('opacity', 0);
                });

        } else if (!xIsNum && yIsNum) {
            // categorical X vs numeric Y
            const jitter = xScale.bandwidth() * 0.7;
            svg.selectAll('circle')
            .data(dataArray)
            .enter().append('circle')
                .attr('cx', d =>
                xScale(d[xAttr])
                + xScale.bandwidth()/2
                + (Math.random() - 0.5) * jitter
                )
                .attr('cy', d => yScale(d[yAttr]))
                .attr('r', 3)
                .attr('fill', 'steelblue')
                .attr('opacity', 0.7)
                // show tooltip of song, artist name
                .on('mouseover', (event, d) => {
                    tooltip
                        .html(`<strong>${d.song_name}</strong><br/>${d.artist}`)
                        .style('opacity', 1);
                })
                // move it with the mouse cursor
                .on('mousemove', event => {
                    tooltip
                        .style('left', (event.pageX + 10) + 'px')
                        .style('top', (event.pageY + 10) + 'px');
                })
                // hide on exit
                .on('mouseout', () => {
                    tooltip.style('opacity', 0);
                });

        } else {
            // both categorical → aggregate & overplot
            // group into combos
            const comboMap = d3.rollup(
            dataArray,
            v => v.map(d => d.song_id),
            d => d[xAttr],
            d => d[yAttr]
            );

            // flatten
            const combos = [];
            for (const [xVal, inner] of comboMap) {
            for (const [yVal, ids] of inner) {
                combos.push({
                xVal, yVal,
                ids,
                count: ids.length
                });
            }
            }

            // radius scale
            const maxCount = d3.max(combos, d => d.count);
            const maxR = Math.min(xScale.bandwidth(), yScale.bandwidth()) / 2;
            const rScale = d3.scaleSqrt()
            .domain([0, maxCount])
            .range([0, maxR]);

            // draw one circle per combo
            svg.selectAll('circle')
            .data(combos)
            .enter().append('circle')
                .attr('cx', d => xScale(d.xVal) + xScale.bandwidth()/2)
                .attr('cy', d => yScale(d.yVal) + yScale.bandwidth()/2)
                .attr('r',  d => rScale(d.count))
                .attr('fill', 'steelblue')
                .attr('opacity', 0.7)
                // show tooltip of song, artist name
                .on('mouseover', (event, d) => {
                    tooltip
                        .html(`${d.count} songs`)
                        .style('opacity', 1);
                })
                // move it with the mouse cursor
                .on('mousemove', event => {
                    tooltip
                        .style('left', (event.pageX + 10) + 'px')
                        .style('top', (event.pageY + 10) + 'px');
                })
                // hide on exit
                .on('mouseout', () => {
                    tooltip.style('opacity', 0);
                })
                // store ids for brushing
                .each(function(d) { d.__ids = d.ids; });
        }

        // 9) Brush → linked filtering
        brushScatter = d3.brush()
            .extent([[0, 0], [W, H]])
            .on('end', ({ selection }) => {
            let selectedIDs;
            if (!selection) {
                // no brush → everyone
                selectedIDs = dataArray.map(d => d.song_id);
            } else {
                const [[x0, y0], [x1, y1]] = selection;
                selectedIDs = [];

                if (xIsNum && yIsNum) {
                // invert pixels → data ranges
                const x0v = xScale.invert(x0), x1v = xScale.invert(x1);
                const y0v = yScale.invert(y1), y1v = yScale.invert(y0);
                dataArray.forEach(d => {
                    const xv = d[xAttr], yv = d[yAttr];
                    if (xv >= Math.min(x0v, x1v) && xv <= Math.max(x0v, x1v)
                    && yv >= Math.min(y0v, y1v) && yv <= Math.max(y0v, y1v)) {
                    selectedIDs.push(d.song_id);
                    }
                });

                } else if (xIsNum && !yIsNum) {
                // numeric X, categorical Y
                const x0v = xScale.invert(x0), x1v = xScale.invert(x1);
                const cats = yScale.domain().filter(cat => {
                    const cy = yScale(cat) + yScale.bandwidth()/2;
                    return cy >= y0 && cy <= y1;
                });
                dataArray.forEach(d => {
                    if (d[xAttr] >= Math.min(x0v, x1v) && d[xAttr] <= Math.max(x0v, x1v)
                    && cats.includes(d[yAttr])) {
                    selectedIDs.push(d.song_id);
                    }
                });

                } else if (!xIsNum && yIsNum) {
                // categorical X, numeric Y
                const y0v = yScale.invert(y1), y1v = yScale.invert(y0);
                const cats = xScale.domain().filter(cat => {
                    const cx = xScale(cat) + xScale.bandwidth()/2;
                    return cx >= x0 && cx <= x1;
                });
                dataArray.forEach(d => {
                    if (d[yAttr] >= Math.min(y0v, y1v) && d[yAttr] <= Math.max(y0v, y1v)
                    && cats.includes(d[xAttr])) {
                    selectedIDs.push(d.song_id);
                    }
                });

                } else {
                // both categorical → look at combo circles
                svg.selectAll('circle').each(function(d) {
                    const cx = +d3.select(this).attr('cx');
                    const cy = +d3.select(this).attr('cy');
                    if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) {
                    selectedIDs = selectedIDs.concat(d.__ids);
                    }
                });
                }
            }

            dispatcher.call('filter', null, selectedIDs);
            });

        const brushG = svg.append('g')
            .attr('class', 'brush')
            .call(brushScatter);

        // move brush group behind *all* other SVG content
        brushG.lower();

        // 10) Notify dimension change (so you can e.g. recolor on axis swap)
        dispatcher.call('dimensionChanged', null, { x: xAttr, y: yAttr });
    }

    // Parallel Coordinates
    function drawPCP(dataArray = data) {
        // clear only the old svg
        const container = d3.select('#parallel-coords');
        container.select('svg').remove();

        const MAX_LINES = 5000;
        let displayData = dataArray;
        if (dataArray.length > MAX_LINES) {
            displayData = d3.shuffle(dataArray).slice(0, MAX_LINES);
        }

        // define dimensions
        const dims = ['explicit', 'Release_year', 'Followers', 'Artist_popularity', 'Song_popularity', 'Duration_sec', 'Acousticness', 'Danceability', 'Energy', 'Instrumentalness', 'Liveness', 'Loudness', 'Speechiness', 'Valence', 'Tempo'];

        // color scale by artist type
        const artistTypes = Array.from(new Set(data.map(d => d.artist_type)));
        const color = d3.scaleOrdinal()
            .domain(artistTypes)
            .range(d3.schemeCategory10);

        // sizing
        const margin = { top: 30, right: 10, bottom: 10, left: 10 };
        const totalW = parseInt(container.style('width'));
        const totalH = parseInt(container.style('height'));
        const W = totalW - margin.left - margin.right;
        const H = totalH - margin.top - margin.bottom;

        // x-scale for axes positions
        const xScale = d3.scalePoint()
            .domain(dims)
            .range([0, W])
            .padding(0.5);
        // y-scales, one per dimension
        const yScales = {};
        dims.forEach(dim => {
            if (dim === 'explicit') {
                // categorical -> point scale
                const domain = Array.from(new Set(displayData.map(d=>d.explicit)));
                yScales[dim] = d3.scalePoint()
                    .domain(domain)
                    .range([H,0])
                    .padding(0.5);
            } else {
                // numeric -> linear
                yScales[dim] = d3.scaleLinear()
                    .domain(d3.extent(displayData, d=>+d[dim]))
                    .nice()
                    .range([H, 0]);
            }
        });

        // create the SVG
        const svg = container.append('svg')
            .attr('width', totalW)
            .attr('height', totalH)
            .append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`)
            .style('cursor', 'default');

        // a function to build the line for one record
        const line = d3.line()
            .defined(([,v]) => v != null) // skip missing
            .x(([x]) => x)
            .y(([,y]) => y);

        function path(d) {
            return line(dims.map(dim => [
                xScale(dim),
                yScales[dim](d[dim])
            ]));
        }
        
        // draw background lines (light gray)
        //svg.append('g')
            //.attr('class', 'background')
            //.selectAll('path')
            //.data(displayData)
            //.enter().append('path')
                //.attr('d', path)
                //.attr('stroke', '#ddd')
                //.attr('fill', 'none');
        
        // draw foreground lines, colored by artist_type
        const foreground = svg.append('g')
            .attr('class', 'foreground')
            .selectAll('path')
            .data(displayData)
            .enter().append('path')
                .attr('d', path)
                .attr('stroke', d => color(d.artist_type))
                .attr('fill', 'none')
                .attr('stroke-opacity', 0.7)
                .attr('stroke-width', 1.5)
                .attr('class', 'pcp-line');
            
        // Subscribe to external brushing/filtering
        dispatcher.on('filter.pcpExternal', selectedIDs => {
            const idSet = new Set(selectedIDs);
            foreground.style('display', d =>
                idSet.has(d.song_id) ? null : 'none'
            );
        });
        
        // store active brush/axis filters
        const axisExtents = {}; // current filters per axis
        const arrowHandles = {}; // to reset later
        // add one axis + brush per dimension
        const axisG = svg.selectAll('.dimension')
            .data(dims)
            .enter().append('g')
                .attr('class', 'dimension')
                .attr('transform', d => `translate(${xScale(d)},0)`);

        axisG.each(function(dim) {
            const g = d3.select(this);
            const yScale = yScales[dim];

            // axis generator
            const axis = (dim === 'explicit')
                ? d3.axisLeft(yScale)
                    .tickFormat(d=>d) //show categorical labels
                : d3.axisLeft(yScale);
            
            // draw the axis
            g.append('g')
                .attr('class', 'axis')
                .call(axis)
                .selectAll('text')
                .style('font-size', '10px');

            // add a title at top
            g.append('text')
                .attr('y', -9)
                .attr('text-anchor', 'middle')
                .style('font-size', '12px')
                .text(dim);

            // add custom arrow handles, initial handles at full extent
            let y0 = 0, y1 = H;
            const topArrow = g.append('path')
                .attr('class', 'pcp-arrow top')
                .attr('d', d3.symbol().type(d3.symbolTriangle).size(80))
                .attr('transform', `translate(0,${y0}) rotate(180)`)
                .style('cursor','ns-resize')
                .style('fill', '#666')
                .call(d3.drag()
                    .on('drag', event => {
                        y0 = Math.max(0, Math.min(event.y, y1));
                        topArrow.attr('transform', `translate(0,${y0}) rotate(180)`);
                        applyFilter(dim, y0, y1);
                    })
                );
            const bottomArrow = g.append('path')
                .attr('class', 'pcp-arrow bottom')
                .attr('d', d3.symbol().type(d3.symbolTriangle).size(80))
                .attr('transform', `translate(0,${y1})`)
                .style('cursor', 'ns-resize')
                .style('fill', '#666')
                .call(d3.drag()
                    .on('drag', event => {
                        y1 = Math.min(H, Math.max(event.y, y0));
                        bottomArrow.attr('transform', `translate(0,${y1})`);
                        applyFilter(dim, y0, y1);
                    })
                );

            // store for reset
            arrowHandles[dim] = { topArrow, bottomArrow };

            // update axisExtents and filter lines + linked charts
            function applyFilter(dim, y0, y1) {
                if (dim === 'explicit') {
                   // pick cats whose position is between y0 and y1
                   axisExtents[dim] = yScale.domain().filter(cat => {
                        const cy = yScale(cat);
                        return cy >= y0 && cy <= y1;
                   });
                } else {
                    // invert pixel extents back to data values
                    const v0 = yScale.invert(y1), v1 = yScale.invert(y0);
                    axisExtents[dim] = [Math.min(v0,v1), Math.max(v0,v1)];
                }

                // now intersect all filters
                let sel = displayData;
                Object.entries(axisExtents).forEach(([k, ext]) => {
                    if (k === 'explicit') {
                        sel = sel.filter(d => ext.includes(d.explicit));
                    } else {
                        sel = sel.filter(d => {
                            const v = +d[k];
                            return v >= ext[0] && v <= ext[1];
                        });
                    }
                });

                // hide polylines not in current intersection/filter
                const selectedIDs = new Set(sel.map(d=>d.song_id));
                foreground.style('display', d =>
                    selectedIDs.has(d.song_id) ? null : 'none'
                );

                // linked brushing
                dispatcher.call('filter', null, Array.from(selectedIDs));
            }
        });
        // raise the lines so they sit above the axes, optionally
        // svg.selectAll('.foreground').raise();

        // reset listener for PCP only
        dispatcher.on('resetPCP.pcp', () => {
            // clear all axis filters
            Object.keys(axisExtents).forEach(k => delete axisExtents[k]);
            // reset arrows to full extents and show all lines
            dims.forEach(dim => {
                const { topArrow, bottomArrow } = arrowHandles[dim];
                topArrow.attr('transform', 'translate(0,0) rotate(180)');
                bottomArrow.attr('transform', `translate(0,${H})`);
            });
            foreground.style('display', null);
        });
    }

    // Area chart (e.g. popularity over release_year)
    function drawArea(dataArray = data) {
        // if nothing to draw, bail out
        if(!dataArray || dataArray.length === 0) {
            // 1) Clear old
            const container = d3.select('#area-chart');
            container.select('svg').remove();

            container.append('div')
                .attr('class', 'no-data')
                .text('No data to display');
            return;
        }
        // clear previous chart
        const container = d3.select('#area-chart');
        container.select('svg').remove();

        // dimensions
        const margin = { top: 30, right: 100, bottom: 50, left: 60 };
        const totalW = parseInt(container.style('width'));
        const totalH = parseInt(container.style('height'));
        const W = totalW - margin.left - margin.right;
        const H = totalH - margin.top - margin.bottom;

        // append SVG
        const svg = container.append('svg')
            .attr('width', totalW)
            .attr('height', totalH)
            .append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        // get list of artist types
        const typesList = Array.from(new Set(data.map(d => d.artist_type)));

        // Aggregate: for each year, sum song_popularity by type
        const nested = Array.from(
            d3.rollup(
                dataArray,
                group => {
                    const sums = Object.fromEntries(typesList.map(t => [t,0]));
                    group.forEach(d => {
                        sums[d.artist_type] += d.song_popularity;
                    });
                    return sums;
                },
                d => d.release_year
            ),
            ([year, sums]) => Object.assign({ year: +year }, sums)
        ).sort((a,b) => a.year - b.year);

        // stack layout
        const stackGen = d3.stack()
            .keys(typesList);
        const series = stackGen(nested);

        // scales
        const xScale = d3.scaleLinear()
            .domain(d3.extent(nested, d => d.year))
            .range([0, W]);
        const yMax = d3.max(series, s => d3.max(s, d => d[1]));
        const yScale = d3.scaleLinear()
            .domain([0, yMax])
            .nice()
            .range([H, 0]);
        
        const color = d3.scaleOrdinal()
            .domain(typesList)
            .range(d3.schemeCategory10);
        
        // area generator
        const area = d3.area()
            .x(d => xScale(d.data.year))
            .y0(d => yScale(d[0]))
            .y1(d => yScale(d[1]));

        // draw each layer
        svg.selectAll('.layer')
            .data(series)
            .enter().append('path')
            .attr('class', 'layer')
            .attr('d', area)
            .attr('fill', d => color(d.key))
            .attr('opacity', 0.8);
        
        // Axes
        svg.append('g')
            .attr('transform', `translate(0,${H})`)
            .call(d3.axisBottom(xScale).ticks(6).tickFormat(d3.format('d')));
        svg.append('g')
            .call(d3.axisLeft(yScale));

        // Axis labels and title
        svg.append('text')
            .attr('x', W/2)
            .attr('y', -10)
            .attr('text-anchor', 'middle')
            .style('font-size','16px')
            .style('text-decoration','underline')
            .text('Song Popularity Over Time by Artist Type');

        svg.append('text')
            .attr('x', W/2)
            .attr('y', H + margin.bottom - 10)
            .attr('text-anchor', 'middle')
            .text('Release Year');

        svg.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('x', -H/2)
            .attr('y', -margin.left + 15)
            .attr('text-anchor', 'middle')
            .text('Sum of Song Popularity');

        // Add a legend for the artist types
        const legend = svg.append('g')
            .attr('class', 'legend')
            .attr('transform', `translate(${W + 20}, 0)`)
            .style('font-family', 'sans-serif')
            .style('font-size', '12px');
        typesList.forEach((t, i) => {
            const legendRow = legend.append('g')
                .attr('transform', `translate(0, ${i * 20})`);
            legendRow.append("rect")
                .attr("width", 12)
                .attr("height", 12)
                .attr("fill", color(t));
            legendRow.append("text")
                .attr("x", 18)
                .attr("y", 10)
                .text(t);
        });
        // brush on x-axis -> dispatch
        const brush = d3.brushX()
            .extent([[0,0],[W,H]])
            .on('end', event => {
                let years;
                if (event.selection) {
                    const [x0, x1] = event.selection;
                    const y0 = xScale.invert(x0),
                    y1 = xScale.invert(x1);
                    years = nested
                        .map(d => d.year)
                        .filter(y => y >= Math.min(y0,y1) && y <= Math.max(y0,y1));
                } else {
                    years = nested.map(d => d.year);
                }
                // collect all song IDs in those years
                const selectedIds = dataArray
                    .filter(d => years.includes(d.release_year))
                    .map(d => d.song_id);
                
                dispatcher.call('filter', null, selectedIds);
            });
        svg.append('g')
            .attr('class', 'brush')
            .call(brush);
        // notify other charts if consider this dimension change
        dispatcher.call('dimensionChanged', null, 'Release_year');
    }

    // MDS plot
    function drawMDS() {
        // Select and clear
        const container = d3.select('#mds-plot');
        container.selectAll('*').remove();

        // Margins and inner size
        const margin = { top: 30, right: 20, bottom: 50, left: 60 };
        const W = parseInt(container.style('width')) - margin.left - margin.right;
        const H = parseInt(container.style('height')) - margin.top - margin.bottom;

        // SVG and group
        const svg = container.append('svg')
            .attr('width', W + margin.left + margin.right)
            .attr('height', H + margin.top + margin.bottom)
            .append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        // Build array of {var, x, y}
        const dims = ['Release_year', 'Duration_sec','Acousticness','Danceability','Energy','Instrumentalness','Liveness', 'Loudness','Speechiness','Valence','Tempo','Artist_popularity','Followers','Song_popularity'];
        const mdsData = dims.map((variable, i) => ({
            variable,
            x: mds_coords[i][0],
            y: mds_coords[i][1]
        }));

        // Scales
        const xExtent = d3.extent(mdsData, d => d.x);
        const yExtent = d3.extent(mdsData, d => d.y);
        const xScale = d3.scaleLinear()
            .domain(xExtent).nice()
            .range([0,W]);
        const yScale = d3.scaleLinear()
            .domain(yExtent).nice()
            .range([H,0]);

        // Axes
        svg.append('g')
            .attr('transform', `translate(0,${H})`)
            .call(d3.axisBottom(xScale));
        svg.append('g')
            .call(d3.axisLeft(yScale));

        // Points
        svg.selectAll('circle')
            .data(mdsData)
            .enter().append('circle')
                .attr('cx', d => xScale(d.x))
                .attr('cy', d => yScale(d.y))
                .attr('r', 5)
                .attr('fill', 'steelblue')
                .attr('opacity', 0.8);

        // Labels
        svg.selectAll('.mds-label')
            .data(mdsData)
            .enter().append('text')
                .attr('class', 'mds-label')
                .attr('x', d => xScale(d.x) + 7)
                .attr('y', d => yScale(d.y) - 7)
                .text(d => d.variable)
                .style('font-size', '10px')
                .style('fill', '#333');
        
        // Title and axis labels
        svg.append('text')
            .attr('x', W/2)
            .attr('y', -10)
            .attr('text-anchor', 'middle')
            .style('font-size', '16px')
            .style('text-decoration', 'underline')
            .text('MDS of Variables (1 - |correlation|)');

        svg.append('text')
            .attr('x', W/2)
            .attr('y', H + margin.bottom - 10)
            .attr('text-anchor', 'middle')
            .text('MDS Dimension 1');

        svg.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('x', -H/2)
            .attr('y', -margin.left + 15)
            .attr('text-anchor', 'middle')
            .text('MDS Dimension 2');
        
    }

    // Redraw all w/ current filter
    function updateAll(selectedIDs) {
        // keep track of the current filter
        const filteredData = data.filter(d => selectedIDs.includes(d.song_id));

        // pull the currently-selected attributes from your dropdowns
        const curCat = d3.select('.cat-select').property('value');
        const curNum = d3.select('.num-select').property('value');
        const curX   = d3.select('.x-select').property('value');
        const curY   = d3.select('.y-select').property('value');

        // clear & redraw each view with the filtered data
        d3.select('#bar-chart').select('svg').remove();
        drawBar(curCat, filteredData);

        d3.select('#histogram').select('svg').remove();
        drawHist(curNum, filteredData);

        d3.select('#scatterplot').select('svg').remove();
        drawScatter(curX, curY, filteredData);

        d3.select('#area-chart').select('svg').remove();
        drawArea(filteredData);
        
    }

    // Wire dispatcher
    dispatcher.on('filter', updateAll);

    d3.select('#reset-btn').on('click', () => {
        dispatcher.call('resetPCP');
        // reset data filter
        const allIDs = data.map(d => d.song_id);
        updateAll(allIDs);

        // clear each brush visually
        d3.select('#bar-chart .brush').call(brushBar.move, null);
        d3.select('#histogram .brush').call(brushHist.move, null);
        d3.select('#scatterplot .brush').call(brushScatter.move, null);
        dispatcher.call('filter', null, allIDs);
        // d3.select('#pcp .brush').call(brushPCP.move, null);
        // d3.select('#area-chart .brush').call(brushArea.move, null);
    });

    const catAttrs = ['artist_type', 'main_genre', 'explicit', 'key', 'mode', 'time_signature'];
    const numAttrs = ['Release_year', 'Duration_sec','Acousticness','Danceability','Energy','Instrumentalness','Liveness', 'Loudness','Speechiness','Valence','Tempo','Artist_popularity','Followers','Song_popularity'];

    // BAR CHART CONTROLS
    const barDiv = d3.select('#bar-chart');
    const barSelect = barDiv.select('.cat-select');
    barSelect.selectAll('option')
        .data(catAttrs)
        .enter().append('option')
            .attr('value', d => d)
            .text(d => d);
    barDiv.select('.cat-select').on('change', () => {
        const attr = barSelect.property('value');
        drawBar(attr);
    });

    // HISTOGRAM CONTROLS
    const histDiv = d3.select('#histogram');
    const histSelect = histDiv.select('.num-select');
    histSelect.selectAll('option')
        .data(numAttrs)
        .enter().append('option')
            .attr('value', d => d)
            .text(d => d);
    histDiv.select('.num-select').on('change', () => {
        const attr = histSelect.property('value');
        drawHist(attr);
    });

    // SCATTER CONTROLS
    const scatDiv = d3.select('#scatterplot');
    const xSelect = scatDiv.select('.x-select');
    const ySelect = scatDiv.select('.y-select');
    [xSelect, ySelect].forEach(sel => {
        sel.selectAll('option')
            .data(catAttrs.concat(numAttrs))
            .enter().append('option')
                .attr('value', d => d)
                .text(d => d);
    });
    scatDiv.selectAll('select').on('change', () => {
        const x = xSelect.property('value');
        const y = ySelect.property('value');
        drawScatter(x, y);
    })


    // Initial bar chart draw
    drawHist(d3.select('.num-select').property('value'));
    drawScatter(d3.select('.x-select').property('value'),
                d3.select('.y-select').property('value'));
    drawBar(d3.select('.cat-select').property('value'));
    drawPCP();
    drawArea();
    drawMDS();

})();