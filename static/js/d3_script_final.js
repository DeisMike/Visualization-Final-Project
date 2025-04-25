// Scales, brush, dispatch for linking
const dispatcher = d3.dispatch('filter', 'dimensionChanged');
let currentFilter = null;
let data; 

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


    // Bar chart
    function drawBar(attr) {
        // Setup and sizing
        const container = d3.select('#bar-chart');
        container.selectAll('*').remove();
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
            d3.rollup(data, v => v.length, d => d[attr]),
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
            .text(`Total songs by ${attr} `);

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
        const brush = d3.brushX()
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
                const selectedIDs = data.filter(d => selectedCats.includes(d[attr])).map(d => d.Song_id);

                // fire the global filter event
                dispatcher.call('filter', null, selectedIDs);
            });

        svg.append('g')
            .attr('class', 'brush')
            .call(brush);

        // notify other charts that the dimension changed
        dispatcher.call('dimensionChanged', null, attr);
    }

    // Histogram
    function drawHist(attr) {
        // Clear out any old chart
        const container = d3.select('#histogram');
        container.selectAll('*').remove();

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
            .domain(d3.extent(data, d => +d[attr]))
            .nice()
            .range([0, W]);

        // Create bins
        const binGenerator = d3.bin()
            .value(d => +d[attr])
            .domain(x.domain())
            .thresholds(20);
        const bins = binGenerator(data);

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
        const brush = d3.brushX()
            .extent([[0, 0], [W, H]])
            .on('end', event => {
                let selected = data;
                if (event.selection) {
                const [x0, x1] = event.selection;
                const d0 = x.invert(x0), d1 = x.invert(x1);
                selected = data.filter(d => {
                    const v = +d[attr];
                    return v >= d0 && v <= d1;
                });
                }
                const selectedIDs = selected.map(d => d.Song_id);
                dispatcher.call('filter', null, selectedIDs);
            });

        svg.append('g')
            .attr('class', 'brush')
            .call(brush);

        // Notify other charts if the numeric dimension changed
        dispatcher.call('dimensionChanged', null, attr);
    }

    // Scatterplot (handles three cases)
    function drawScatter(xAttr, yAttr) {
        // if both numeric -> normal dots
        // if one cat -> jitter strip
        // if both cat -> sized/overplotted symbols
        // brush -> dispatch
    }

    // Scree plot
    function drawScree() {
        const svg = d3.select('#scree-plot').append('svg');
        const x = d3.scaleBand().domain(d3.range(pca_explained.length)).range([0, width]);
        const y = d3.scaleLinear().domain([0, d3.max(pca_explained)]);
        // bars
    }

    // Parallel Coordinates
    function drawPCP() {
        const dims = ['Release_year', 'Followers', 'Artist_popularity', 'Song_popularity', 'Duration_sec', 'Acousticness', 'Danceability', 'Energy', 'Instrumentalness', 'Liveness', 'Loudness', 'Speechiness', 'Valence', 'Tempo'];
        // create a line for each song across axes
        // add brushing per axis -> dispatch
    }

    // Area chart (e.g. popularity over release_year)
    function drawArea() {
        const yearly = d3.rollup(data, v=>d3.mean(v, d=>+d.Song_popularity), d=>d.Release_year);
        // area generator
        // brush on x-axis -> dispatch
    }

    // MDS plot
    function drawMDS() {
        const coords = data.map((d,i) => ({x: mds_coords[i][0], y: mds_coords[i][1]}));
        // draw points
        // brush -> dispatch
    }

    // Redraw all w/ current filter
    function updateAll(filteredIDs) {
        currentFilter = new Set(filteredIDs);
        // for each chart, apply filter to data and rerender only highlights
    }

    // Wire dispatcher
    dispatcher.on('filter', updateAll);

    const catAttrs = ['song_name', 'artist', 'artist_type', 'main_genre', 'explicit', 'key', 'mode', 'time_signature'];
    const numAttrs = ['Release_year', 'Duration_sec','Acousticness','Danceability','Energy','Instrumentalness','Liveness', 'Loudness','Speechiness','Valence','Tempo','Artist_popularity','Followers','Song_popularity'];

    // Populate dropdowns
    catAttrs.forEach(a => d3.select('#cat-select').append('option').text(a).attr('value',a));
    numAttrs.forEach(a => d3.select('#num-select').append('option').text(a).attr('value',a));
    [...catAttrs, ...numAttrs].forEach(a => {
        d3.select('#x-select').append('option').text(a).attr('value',a);
        d3.select('#y-select').append('option').text(a).attr('value',a);
    });

    // Hookup event handlers
    d3.select('#num-update').on('click', () => {
        const attr = d3.select('#num-select').property('value');
        d3.select('#histogram').selectAll('*').remove();
        drawHist(attr);
    });
    d3.selectAll('#x-select, #y-select').on('change', () => {
        const x = d3.select('#x-select').property('value');
        const y = d3.select('#y-select').property('value');
        d3.select('#scatterplot').selectAll('*').remove();
        drawScatter(x, y);
    });
    d3.select('#cat-select').on('change', function() {
        const chosen = d3.select(this).property('value');
        d3.select('#bar-chart').selectAll('*').remove();
        drawBar(chosen);
    });


    // Initial bar chart draw
    drawHist(d3.select('#num-select').property('value'));
    drawScatter(d3.select('#x-select').property('value'),
                d3.select('#y-select').property('value'));
    drawBar(d3.select('#cat-select').property('value'));
    drawScree();
    drawPCP();
    drawArea();
    drawMDS();

})();