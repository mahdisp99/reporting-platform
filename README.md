# Reporting Platform

An enterprise-grade reporting platform with a powerful P&L (Profit & Loss) generator featuring dimensional analysis capabilities.

## Features

### P&L Report Generator

The P&L Report is the flagship feature of this platform, offering:

#### Dimensional Analysis
- **Hierarchical drill-down**: Navigate from summary to detail levels
  - Product hierarchy: Category → Subcategory → Product Type → Item
  - Geography hierarchy: Province → City → Store
  - Time hierarchy: Year → Quarter → Month → Week → Day
- **Multi-dimensional rows**: Combine multiple dimensions for cross-analysis
- **Time-based columns**: Analyze metrics across periods with automatic comparisons

#### Metrics & Calculations
- **Standard metrics**: Revenue, Cost of Goods, Quantity, Discounts
- **Calculated metrics**:
  - Gross Profit = Revenue - Cost of Goods
  - Gross Margin % = (Gross Profit / Revenue) × 100
  - Net Revenue = Revenue - Discounts
  - Average Order Value = Revenue / Order Count
- **Format support**: Currency, percentages, integers, decimals

#### Filters
- Multi-dimension filtering with operators:
  - Equals / Not Equals
  - In List / Not In List
  - Greater Than / Less Than
  - Between (range)
- Dynamic filter UI based on data type
- Persistent filter state

#### Comparisons
- Year-over-Year (YoY) analysis
- Month-over-Month (MoM) trends
- Variance calculation with percentage change
- Visual indicators for positive/negative changes

#### Export Options
- CSV export
- Excel export (planned)
- PDF export (planned)

## Project Structure

```
reporting-platform/
├── src/
│   ├── components/
│   │   ├── pl/                    # P&L specific components
│   │   │   ├── PnLReport.tsx      # Main report container
│   │   │   └── PnLTable.tsx       # Interactive data table
│   │   └── common/                # Shared components
│   │       ├── DimensionSelector.tsx
│   │       ├── MetricSelector.tsx
│   │       └── FilterPanel.tsx
│   ├── types/
│   │   └── pnl.ts                 # TypeScript definitions
│   ├── utils/
│   │   └── pnlQueryBuilder.ts     # SQL query generation
│   ├── styles/
│   │   └── pnl.css                # Component styles
│   ├── App.tsx
│   └── main.tsx
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Type check
npm run typecheck

# Build for production
npm run build
```

## Database Integration

The P&L generator is designed to work with dimensional data models:

### Schema Assumptions

**Fact Table: `order_items`**
- `order_id`: Reference to orders
- `product_id`: Reference to products
- `quantity`: Number of items
- `revenue`: Sale amount
- `cost_amount`: Cost of goods
- `discount_amount`: Applied discount

**Dimension Tables:**
- `products`: Product hierarchy (category_level_1, category_level_2, category_level_3)
- `locations`: Geography (province, city, store_id)
- `dates`: Time dimensions (year, quarter, month, week, date)
- `orders`: Order-level data

### Query Builder

The `PnLQueryBuilder` class automatically generates SQL based on:
- Selected dimensions (for GROUP BY)
- Selected metrics (for aggregations)
- Applied filters (for WHERE clauses)
- Required JOINs between fact and dimension tables

Example generated query:
```sql
SELECT
  p.category_level_1 AS dim_category_l1,
  d.quarter AS dim_quarter,
  SUM(oi.revenue) AS metric_revenue,
  SUM(oi.cost_amount) AS metric_cost_of_goods
FROM order_items oi
JOIN products p ON oi.product_id = p.id
JOIN orders o ON oi.order_id = o.id
JOIN dates d ON o.date_id = d.id
WHERE d.date BETWEEN '2024-01-01' AND '2024-06-30'
GROUP BY p.category_level_1, d.quarter
ORDER BY dim_category_l1, dim_quarter
```

## Architecture

### Dimensional Model
The P&L uses a star/snowflake schema approach:
- **Facts**: Quantitative data (sales, costs)
- **Dimensions**: Descriptive attributes (category, location, time)
- **Hierarchies**: Enable drill-down from summary to detail

### State Management
- Configuration state managed in `PnLReport` component
- Drill-down data cached to prevent redundant API calls
- Filter state persisted per session

### Performance Optimizations
- Lazy loading of drill-down data
- Debounced filter updates
- Virtual scrolling for large datasets (planned)
- Query result caching (planned)

## Customization

### Adding New Dimensions
```typescript
// In types/pnl.ts
export const CUSTOM_HIERARCHY: Dimension[] = [
  { id: 'channel', name: 'Sales Channel', field: 'channel', table: 'orders', level: 0 },
  { id: 'sales_rep', name: 'Sales Rep', field: 'rep_id', table: 'orders', level: 1, parentDimension: 'channel' },
];
```

### Adding New Metrics
```typescript
// In types/pnl.ts
export const CUSTOM_METRICS: CalculatedMetric[] = [
  {
    id: 'contribution_margin',
    name: 'Contribution Margin',
    field: 'contribution_margin',
    table: 'calculated',
    aggregation: 'custom',
    type: 'calculated',
    format: 'currency',
    decimals: 0,
    dependencies: ['gross_profit', 'variable_costs'],
    calculate: (row) => (row.gross_profit || 0) - (row.variable_costs || 0),
  },
];
```

## Roadmap

- [ ] API integration layer
- [ ] Real-time data updates via WebSockets
- [ ] Scheduled report generation
- [ ] Dashboard widget embedding
- [ ] User preferences & saved reports
- [ ] Advanced chart visualizations (ECharts integration)
- [ ] Collaborative annotations
- [ ] Row-level security

## Backend API (ClickHouse)

The frontend now reads live data from a FastAPI backend.

### Run backend

```bash
cd backend
python -m pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

### Required environment variables

```bash
BASALAM_CH_USER=...
BASALAM_CH_PASSWORD=...
```

Optional overrides:

```bash
BASALAM_CH_HOST=proxy.bk0i.basalam.dev
BASALAM_CH_PORT=39674
BASALAM_CH_DATABASE=OLAPBasalam
```

### Frontend API base

By default frontend requests `/api/*` on the same host. For local dev, Vite proxies `/api` to `http://127.0.0.1:8000`.

## License

MIT
