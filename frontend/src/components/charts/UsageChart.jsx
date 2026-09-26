import React, { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';

/**
 * D3.js Usage / Throughput Time Series Chart
 * Displays verification volume and discrepancy trends with interactive crosshair and tooltip.
 */
export function UsageChart({
  data = [],
  height = 220,
  className = '',
}) {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || !data || data.length === 0) return;

    const width = containerRef.current.clientWidth || 500;
    const margin = { top: 16, right: 16, bottom: 28, left: 36 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('width', width).attr('height', height);

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // X Scale
    const xScale = d3
      .scalePoint()
      .domain(data.map((d) => d.date))
      .range([0, innerWidth])
      .padding(0.1);

    // Y Scale
    const rawMax = d3.max(data, (d) => Math.max(d.processed || 0, (d.matches || 0) + (d.mismatches || 0))) || 0;
    const isAllZero = rawMax === 0;
    const maxVal = isAllZero ? 10 : rawMax;
    const yScale = d3
      .scaleLinear()
      .domain([0, maxVal * 1.15])
      .range([innerHeight, 0])
      .nice();

    // Subtle Grid lines
    g.append('g')
      .attr('class', 'grid')
      .call(
        d3
          .axisLeft(yScale)
          .ticks(4)
          .tickSize(-innerWidth)
          .tickFormat('')
      )
      .selectAll('line')
      .attr('stroke', '#E2E8F0')
      .attr('stroke-dasharray', '2 4')
      .attr('stroke-opacity', 0.8);
    g.selectAll('.grid .domain').remove();

    // Gradients
    const defs = svg.append('defs');

    const gradProcessed = defs
      .append('linearGradient')
      .attr('id', 'usage-grad-processed')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');
    gradProcessed.append('stop').attr('offset', '0%').attr('stop-color', '#6366F1').attr('stop-opacity', 0.22);
    gradProcessed.append('stop').attr('offset', '100%').attr('stop-color', '#6366F1').attr('stop-opacity', 0.01);

    const gradMatches = defs
      .append('linearGradient')
      .attr('id', 'usage-grad-matches')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');
    gradMatches.append('stop').attr('offset', '0%').attr('stop-color', '#10B981').attr('stop-opacity', 0.2);
    gradMatches.append('stop').attr('offset', '100%').attr('stop-color', '#10B981').attr('stop-opacity', 0.0);

    // Area: Total Processed
    const areaProcessed = d3
      .area()
      .x((d) => xScale(d.date))
      .y0(innerHeight)
      .y1((d) => yScale(d.processed))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(data)
      .attr('fill', 'url(#usage-grad-processed)')
      .attr('d', areaProcessed);

    // Area: Matches
    const areaMatches = d3
      .area()
      .x((d) => xScale(d.date))
      .y0(innerHeight)
      .y1((d) => yScale(d.matches))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(data)
      .attr('fill', 'url(#usage-grad-matches)')
      .attr('d', areaMatches);

    // Line: Processed
    const lineProcessed = d3
      .line()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.processed))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#6366F1')
      .attr('stroke-width', 2.2)
      .attr('d', lineProcessed);

    // Line: Matches
    const lineMatches = d3
      .line()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.matches))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#10B981')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '4 3')
      .attr('d', lineMatches);

    // X-Axis
    const xAxis = d3.axisBottom(xScale).tickSize(0).tickPadding(8);
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)
      .call((g) => g.select('.domain').attr('stroke', '#E2E8F0'))
      .selectAll('text')
      .attr('fill', '#64748B')
      .attr('font-size', '11px')
      .attr('font-family', 'Lexend');

    // Y-Axis
    const yAxis = d3.axisLeft(yScale).ticks(4).tickSize(0).tickPadding(6);
    g.append('g')
      .call(yAxis)
      .call((g) => g.select('.domain').remove())
      .selectAll('text')
      .attr('fill', '#94A3B8')
      .attr('font-size', '11px')
      .attr('font-family', 'Lexend');

    if (isAllZero) {
      g.append('text')
        .attr('x', innerWidth / 2)
        .attr('y', innerHeight / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', '#94A3B8')
        .attr('font-size', '12px')
        .attr('font-weight', '500')
        .attr('font-family', 'Lexend')
        .text('No documents processed yet — throughput curve will populate as emails arrive');
    }

    // Interactive Overlay
    const bisect = d3.bisector((d) => d.date).center;
    const focusLine = g
      .append('line')
      .attr('stroke', '#94A3B8')
      .attr('stroke-dasharray', '3 3')
      .attr('y1', 0)
      .attr('y2', innerHeight)
      .style('opacity', 0);

    const overlay = g
      .append('rect')
      .attr('width', innerWidth)
      .attr('height', innerHeight)
      .attr('fill', 'transparent')
      .attr('cursor', 'crosshair');

    overlay
      .on('mousemove', (event) => {
        const [mx] = d3.pointer(event);
        const eachBand = innerWidth / (data.length - 1 || 1);
        const idx = Math.max(0, Math.min(data.length - 1, Math.round(mx / eachBand)));
        const d = data[idx];
        if (!d) return;

        const cx = xScale(d.date);
        focusLine.attr('x1', cx).attr('x2', cx).style('opacity', 1);

        setTooltip({
          x: cx + margin.left,
          y: yScale(d.processed) + margin.top,
          containerWidth: width,
          data: d,
        });
      })
      .on('mouseleave', () => {
        focusLine.style('opacity', 0);
        setTooltip(null);
      });
  }, [data, height]);

  // Dynamic edge-aware positioning to prevent underlapping or clipping on right/left boundaries
  const isNearRight = tooltip && tooltip.containerWidth && tooltip.x > (tooltip.containerWidth - 120);
  const isNearLeft = tooltip && tooltip.x < 110;
  const isNearTop = tooltip && tooltip.y < 85;

  // When near right edge, shift left so the entire tooltip stays cleanly within the container
  const translateX = isNearRight ? '-94%' : isNearLeft ? '-6%' : '-50%';
  const translateY = isNearTop ? '12px' : 'calc(-100% - 10px)';

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      <svg ref={svgRef} className="overflow-visible block w-full" />
      {tooltip && (
        <div
          className="absolute pointer-events-none z-50 bg-slate-900/95 backdrop-blur-md text-white px-3.5 py-2.5 rounded-xl shadow-2xl text-xs min-w-[155px] border border-slate-700/60 transition-transform duration-75"
          style={{
            left: `${tooltip.x}px`,
            top: `${tooltip.y}px`,
            transform: `translate(${translateX}, ${translateY})`,
          }}
        >
          {/* Arrow Pointer Tip */}
          <div
            className="absolute w-2.5 h-2.5 bg-slate-900 rotate-45"
            style={{
              left: isNearRight ? '90%' : isNearLeft ? '10%' : '50%',
              transform: 'translateX(-50%)',
              bottom: isNearTop ? 'auto' : '-5px',
              top: isNearTop ? '-5px' : 'auto',
              borderTop: isNearTop ? '1px solid rgba(51, 65, 85, 0.6)' : 'none',
              borderLeft: isNearTop ? '1px solid rgba(51, 65, 85, 0.6)' : 'none',
              borderBottom: isNearTop ? 'none' : '1px solid rgba(51, 65, 85, 0.6)',
              borderRight: isNearTop ? 'none' : '1px solid rgba(51, 65, 85, 0.6)',
            }}
          />

          <div className="font-semibold text-slate-200 border-b border-slate-700/60 pb-1 mb-1.5 flex justify-between items-center">
            <span>{tooltip.data.date}</span>
            <span className="text-brand-300 font-mono text-[11px] font-bold">
              {tooltip.data.processed} total
            </span>
          </div>
          <div className="space-y-1.5 text-[11px]">
            <div className="flex justify-between items-center text-emerald-400">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" /> Clean Matches
              </span>
              <span className="font-mono font-medium">{tooltip.data.matches}</span>
            </div>
            <div className="flex justify-between items-center text-rose-400">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400 inline-block" /> Discrepancies
              </span>
              <span className="font-mono font-medium">{tooltip.data.mismatches}</span>
            </div>
            <div className="flex justify-between items-center text-amber-400">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" /> Review Flagged
              </span>
              <span className="font-mono font-medium">{tooltip.data.reviews}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default UsageChart;
