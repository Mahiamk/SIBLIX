import React, { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';

/**
 * D3.js Reusable Sparkline Component
 * Features:
 * - Smooth MonotoneX Bézier curve
 * - Elegant gradient area fill
 * - Interactive hover with tooltip and indicator dot
 * - End value pulse badge
 */
export function Sparkline({
  data = [10, 14, 12, 18, 16, 24, 22, 28, 25, 32],
  width = 120,
  height = 36,
  color = '#171B24', // Thunderhead Pitch storm default
  strokeWidth = 2,
  showArea = true,
  interactive = true,
  className = '',
}) {
  const svgRef = useRef(null);
  const [hoveredPoint, setHoveredPoint] = useState(null);

  const gradientId = `spark-grad-${React.useId().replace(/:/g, '')}`;

  useEffect(() => {
    if (!svgRef.current || !data || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const padding = 4;
    const w = width - padding * 2;
    const h = height - padding * 2;

    // Scales
    const xScale = d3
      .scaleLinear()
      .domain([0, data.length - 1])
      .range([padding, width - padding]);

    const yMin = d3.min(data) ?? 0;
    const yMax = d3.max(data) ?? 100;
    const ySpan = yMax - yMin === 0 ? 1 : yMax - yMin;

    const yScale = d3
      .scaleLinear()
      .domain([yMin - ySpan * 0.1, yMax + ySpan * 0.1])
      .range([height - padding, padding]);

    // Defs for gradient
    const defs = svg.append('defs');
    const linearGradient = defs
      .append('linearGradient')
      .attr('id', gradientId)
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');

    linearGradient
      .append('stop')
      .attr('offset', '0%')
      .attr('stop-color', color)
      .attr('stop-opacity', 0.28);

    linearGradient
      .append('stop')
      .attr('offset', '100%')
      .attr('stop-color', color)
      .attr('stop-opacity', 0.0);

    // Area generator
    if (showArea) {
      const area = d3
        .area()
        .x((_, i) => xScale(i))
        .y0(height - padding)
        .y1((d) => yScale(d))
        .curve(d3.curveMonotoneX);

      svg
        .append('path')
        .datum(data)
        .attr('fill', `url(#${gradientId})`)
        .attr('d', area);
    }

    // Line generator
    const line = d3
      .line()
      .x((_, i) => xScale(i))
      .y((d) => yScale(d))
      .curve(d3.curveMonotoneX);

    svg
      .append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', color)
      .attr('stroke-width', strokeWidth)
      .attr('stroke-linecap', 'round')
      .attr('stroke-linejoin', 'round')
      .attr('d', line);

    // Latest / End Dot
    const lastIdx = data.length - 1;
    const lastX = xScale(lastIdx);
    const lastY = yScale(data[lastIdx]);

    svg
      .append('circle')
      .attr('cx', lastX)
      .attr('cy', lastY)
      .attr('r', 2.8)
      .attr('fill', color);

    svg
      .append('circle')
      .attr('cx', lastX)
      .attr('cy', lastY)
      .attr('r', 5.5)
      .attr('fill', color)
      .attr('opacity', 0.25)
      .attr('class', 'animate-ping');
  }, [data, width, height, color, strokeWidth, showArea, gradientId]);

  const handleMouseMove = (e) => {
    if (!interactive || !data || data.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const step = rect.width / (data.length - 1);
    const index = Math.round(mouseX / step);
    const safeIndex = Math.max(0, Math.min(data.length - 1, index));
    setHoveredPoint({ index: safeIndex, value: data[safeIndex], x: mouseX });
  };

  const handleMouseLeave = () => {
    setHoveredPoint(null);
  };

  return (
    <div
      className={`relative inline-block select-none ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="overflow-visible block"
      />
      {hoveredPoint && (
        <div
          className="absolute -top-7 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-slate-900 text-white text-[11px] font-mono font-medium rounded shadow pointer-events-none whitespace-nowrap z-20"
          style={{ left: `${hoveredPoint.x}px` }}
        >
          {hoveredPoint.value}
        </div>
      )}
    </div>
  );
}

export default Sparkline;
