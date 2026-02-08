Create a new module at src/core/metrics/ for tracking architectural metrics.

The module should include:
1. types.ts - Define MetricType, MetricValue, MetricsSnapshot types
2. collector.ts - MetricsCollector class that gathers metrics from the DB
3. index.ts - Barrel exports

Metrics to track:
- filesByArchitecture: Map of archId -> count
- untaggedFiles: count of files without @arch
- violationsByRule: Map of rule -> count
- coveragePercent: tagged files / total files

Requirements:
- Infer the correct architecture IDs from existing patterns in src/core/
- Do NOT import from cli or mcp layers
- Follow the modification order: types -> implementation -> barrel
- Use existing database repositories for data access
