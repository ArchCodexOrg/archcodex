/**
 * @arch extension.client
 *
 * HTML templates for Import Graph Panel.
 */
import type { D3GraphData } from './import-graph-types.js';

/**
 * Escape HTML entities to prevent XSS.
 */
export function escapeHtml(text: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (char) => htmlEntities[char]);
}

/**
 * Get loading HTML.
 */
export function getLoadingHtml(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
    }
    .loading { text-align: center; }
    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid var(--vscode-editor-foreground);
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 16px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="loading">
    <div class="spinner"></div>
    <div>Building import graph...</div>
  </div>
</body>
</html>`;
}

/**
 * Get error HTML.
 */
export function getErrorHtml(message: string): string {
  const safeMessage = escapeHtml(message);
  return `<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
    }
    .error { text-align: center; color: var(--vscode-errorForeground); }
  </style>
</head>
<body>
  <div class="error">
    <h2>Error building import graph</h2>
    <p>${safeMessage}</p>
  </div>
</body>
</html>`;
}

/**
 * Get graph HTML with D3.js visualization.
 */
export function getGraphHtml(data: D3GraphData): string {
  // Sanitize all string values in the data
  const sanitizedData: D3GraphData = {
    nodes: data.nodes.map(node => ({
      ...node,
      id: node.id,
      label: escapeHtml(node.label),
      archId: node.archId ? escapeHtml(node.archId) : null,
      layer: node.layer ? escapeHtml(node.layer) : null,
    })),
    links: data.links,
    layers: data.layers.map(layer => ({
      name: escapeHtml(layer.name),
      color: layer.color,
    })),
  };

  const dataJson = JSON.stringify(sanitizedData);

  return `<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 100vw; height: 100vh; overflow: hidden;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
    }
    #graph { width: 100%; height: 100%; }
    .node { cursor: pointer; }
    .node circle { stroke: var(--vscode-editor-foreground); stroke-width: 1.5px; }
    .node.in-cycle circle { stroke: #f44336; stroke-width: 3px; }
    .node text { font-size: 10px; fill: var(--vscode-editor-foreground); pointer-events: none; }
    .link { stroke: var(--vscode-editor-foreground); stroke-opacity: 0.3; fill: none; }
    .link.in-cycle { stroke: #f44336; stroke-opacity: 0.8; stroke-width: 2px; }
    .controls {
      position: absolute; top: 10px; right: 10px;
      display: flex; gap: 8px; z-index: 100;
    }
    .controls button {
      padding: 6px 12px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none; border-radius: 4px; cursor: pointer; font-size: 12px;
    }
    .controls button:hover { background: var(--vscode-button-hoverBackground); }
    .legend, .stats {
      position: absolute;
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px; padding: 8px; font-size: 11px; z-index: 100;
    }
    .legend { bottom: 10px; left: 10px; }
    .stats { top: 10px; left: 10px; }
    .legend-item { display: flex; align-items: center; gap: 6px; margin: 4px 0; }
    .legend-color { width: 12px; height: 12px; border-radius: 50%; }
    .tooltip {
      position: absolute;
      background: var(--vscode-editorWidget-background);
      border: 1px solid var(--vscode-editorWidget-border);
      border-radius: 4px; padding: 8px; font-size: 11px;
      pointer-events: none; opacity: 0; z-index: 200; max-width: 300px;
    }
  </style>
</head>
<body>
  <div class="controls">
    <button onclick="zoomIn()">Zoom In</button>
    <button onclick="zoomOut()">Zoom Out</button>
    <button onclick="resetZoom()">Reset</button>
    <button onclick="refresh()">Refresh</button>
  </div>
  <div class="stats" id="stats"></div>
  <div class="legend" id="legend"></div>
  <div class="tooltip" id="tooltip"></div>
  <svg id="graph"></svg>

  <script src="https://d3js.org/d3.v7.min.js"></script>
  <script>
    const vscode = acquireVsCodeApi();
    const data = ${dataJson};

    // Stats
    const statsEl = document.getElementById('stats');
    const cycleNodes = data.nodes.filter(n => n.inCycle).length;
    const statsText = 'Nodes: ' + data.nodes.length + ' | Links: ' + data.links.length;
    if (cycleNodes > 0) {
      statsEl.textContent = statsText + ' | ';
      const cycleSpan = document.createElement('span');
      cycleSpan.style.color = '#f44336';
      cycleSpan.textContent = 'Cycles: ' + cycleNodes + ' nodes';
      statsEl.appendChild(cycleSpan);
    } else {
      statsEl.textContent = statsText;
    }

    // Legend
    const legendEl = document.getElementById('legend');
    data.layers.forEach(function(l) {
      const item = document.createElement('div');
      item.className = 'legend-item';
      const colorBox = document.createElement('div');
      colorBox.className = 'legend-color';
      colorBox.style.background = l.color;
      const label = document.createElement('span');
      label.textContent = l.name;
      item.appendChild(colorBox);
      item.appendChild(label);
      legendEl.appendChild(item);
    });

    ['No layer|#888', 'In cycle|#f44336'].forEach(function(s) {
      var parts = s.split('|');
      var item = document.createElement('div');
      item.className = 'legend-item';
      var colorBox = document.createElement('div');
      colorBox.className = 'legend-color';
      colorBox.style.background = parts[1];
      if (parts[0] === 'In cycle') colorBox.style.border = '2px solid #f44336';
      var label = document.createElement('span');
      label.textContent = parts[0];
      item.appendChild(colorBox);
      item.appendChild(label);
      legendEl.appendChild(item);
    });

    const layerColorMap = new Map(data.layers.map(l => [l.name, l.color]));
    const svg = d3.select('#graph');
    const width = window.innerWidth;
    const height = window.innerHeight;
    svg.attr('width', width).attr('height', height);

    const container = svg.append('g');
    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => container.attr('transform', event.transform));
    svg.call(zoom);

    // Arrow markers
    svg.append('defs').append('marker')
      .attr('id', 'arrowhead').attr('viewBox', '-0 -5 10 10')
      .attr('refX', 20).attr('refY', 0).attr('orient', 'auto')
      .attr('markerWidth', 6).attr('markerHeight', 6)
      .append('path').attr('d', 'M 0,-5 L 10,0 L 0,5')
      .attr('fill', 'var(--vscode-editor-foreground)').style('opacity', 0.3);

    svg.append('defs').append('marker')
      .attr('id', 'arrowhead-cycle').attr('viewBox', '-0 -5 10 10')
      .attr('refX', 20).attr('refY', 0).attr('orient', 'auto')
      .attr('markerWidth', 6).attr('markerHeight', 6)
      .append('path').attr('d', 'M 0,-5 L 10,0 L 0,5')
      .attr('fill', '#f44336').style('opacity', 0.8);

    const simulation = d3.forceSimulation(data.nodes)
      .force('link', d3.forceLink(data.links).id(d => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(30));

    const link = container.append('g').selectAll('line').data(data.links).join('line')
      .attr('class', d => 'link' + (d.inCycle ? ' in-cycle' : ''))
      .attr('marker-end', d => d.inCycle ? 'url(#arrowhead-cycle)' : 'url(#arrowhead)');

    const node = container.append('g').selectAll('g').data(data.nodes).join('g')
      .attr('class', d => 'node' + (d.inCycle ? ' in-cycle' : ''))
      .call(d3.drag().on('start', dragstarted).on('drag', dragged).on('end', dragended));

    node.append('circle')
      .attr('r', d => Math.min(5 + Math.sqrt(d.importedByCount) * 2, 20))
      .attr('fill', d => d.layer ? (layerColorMap.get(d.layer) || '#888') : '#888');

    node.append('text').attr('dx', 12).attr('dy', 4).text(d => d.label);

    const tooltipEl = document.getElementById('tooltip');
    node.on('mouseover', (event, d) => {
      tooltipEl.textContent = '';
      tooltipEl.style.opacity = 1;
      tooltipEl.style.left = (event.pageX + 10) + 'px';
      tooltipEl.style.top = (event.pageY - 10) + 'px';
      var strong = document.createElement('strong');
      strong.textContent = d.label;
      tooltipEl.appendChild(strong);
      tooltipEl.appendChild(document.createElement('br'));
      if (d.archId) { tooltipEl.appendChild(document.createTextNode('Arch: ' + d.archId)); tooltipEl.appendChild(document.createElement('br')); }
      if (d.layer) { tooltipEl.appendChild(document.createTextNode('Layer: ' + d.layer)); tooltipEl.appendChild(document.createElement('br')); }
      tooltipEl.appendChild(document.createTextNode('Imports: ' + d.importCount));
      tooltipEl.appendChild(document.createElement('br'));
      tooltipEl.appendChild(document.createTextNode('Imported by: ' + d.importedByCount));
      if (d.inCycle) {
        tooltipEl.appendChild(document.createElement('br'));
        var cycleWarn = document.createElement('span');
        cycleWarn.style.color = '#f44336';
        cycleWarn.textContent = 'In circular dependency';
        tooltipEl.appendChild(cycleWarn);
      }
    })
    .on('mouseout', () => { tooltipEl.style.opacity = 0; })
    .on('click', (event, d) => { vscode.postMessage({ command: 'openFile', filePath: d.id }); });

    simulation.on('tick', () => {
      link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
          .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      node.attr('transform', d => 'translate(' + d.x + ',' + d.y + ')');
    });

    function dragstarted(event, d) { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; }
    function dragged(event, d) { d.fx = event.x; d.fy = event.y; }
    function dragended(event, d) { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }
    function zoomIn() { svg.transition().call(zoom.scaleBy, 1.5); }
    function zoomOut() { svg.transition().call(zoom.scaleBy, 0.67); }
    function resetZoom() { svg.transition().call(zoom.transform, d3.zoomIdentity); }
    function refresh() { vscode.postMessage({ command: 'refresh' }); }

    window.addEventListener('resize', () => {
      const newWidth = window.innerWidth, newHeight = window.innerHeight;
      svg.attr('width', newWidth).attr('height', newHeight);
      simulation.force('center', d3.forceCenter(newWidth / 2, newHeight / 2));
      simulation.alpha(0.3).restart();
    });
  </script>
</body>
</html>`;
}
