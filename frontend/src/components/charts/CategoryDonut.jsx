import React, { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';
import { CATEGORIES } from '../../constants/taxonomy';

/**
 * D3.js Category Donut Chart
 * Renders interactive distribution with inner hole showing active stats.
 * Gracefully displays a clean neutral ring when total emails is 0.
 */
export function CategoryDonut({
  counts = {},
  size = 180,
  innerRadius = 52,
  outerRadius = 78,
  className = '',
}) {
  const svgRef = useRef(null);
  const [hovered, setHovered] = useState(null);

  const entries = Object.keys(CATEGORIES).map((key) => ({
    key,
    label: CATEGORIES[key].label,
    color: CATEGORIES[key].color,
    value: counts[key] || 0,
  }));

  const realTotal = entries.reduce((acc, curr) => acc + curr.value, 0);

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const g = svg
      .append('g')
      .attr('transform', `translate(${size / 2}, ${size / 2})`);

    // When 0 items in inbox, render neutral empty ring
    if (realTotal === 0) {
      g.append('circle')
        .attr('r', (innerRadius + outerRadius) / 2)
        .attr('fill', 'none')
        .attr('stroke', '#F1F5F9')
        .attr('stroke-width', outerRadius - innerRadius);
      return;
    }

    const pie = d3
      .pie()
      .value((d) => d.value)
      .sort(null)
      .padAngle(0.03);

    const arc = d3.arc().innerRadius(innerRadius).outerRadius(outerRadius).cornerRadius(4);
    const arcHover = d3.arc().innerRadius(innerRadius - 2).outerRadius(outerRadius + 4).cornerRadius(4);

    const arcs = g
      .selectAll('.arc')
      .data(pie(entries))
      .enter()
      .append('g')
      .attr('class', 'arc cursor-pointer');

    arcs
      .append('path')
      .attr('d', arc)
      .attr('fill', (d) => d.data.color)
      .attr('stroke', '#FFFFFF')
      .attr('stroke-width', 1.5)
      .style('transition', 'all 0.2s ease-out')
      .on('mouseenter', function (event, d) {
        d3.select(this)
          .transition()
          .duration(150)
          .attr('d', arcHover)
          .attr('opacity', 0.9);
        setHovered(d.data);
      })
      .on('mouseleave', function () {
        d3.select(this)
          .transition()
          .duration(150)
          .attr('d', arc)
          .attr('opacity', 1);
        setHovered(null);
      });
  }, [counts, size, innerRadius, outerRadius, realTotal]);

  const activeLabel = hovered ? hovered.label : 'Total Inbox';
  const activeValue = hovered ? hovered.value : realTotal;
  const activePercent = realTotal > 0 ? Math.round((activeValue / realTotal) * 100) : 0;

  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      <svg ref={svgRef} width={size} height={size} className="overflow-visible" />
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
        <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider line-clamp-1 max-w-[80px]">
          {activeLabel}
        </span>
        <span className="text-xl font-bold text-slate-800 tracking-tight">
          {activeValue}
        </span>
        <span className="text-[10px] font-mono text-slate-400">
          {activePercent}%
        </span>
      </div>
    </div>
  );
}

export default CategoryDonut;
