import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const panelStyle = {
  background: "#ffffff",
  color: "#24313d",
  border: "1px solid #e0e6eb",
  borderRadius: 8,
  padding: 20,
  boxShadow: "0 2px 8px rgba(16, 24, 40, 0.04)",
};

const tooltipStyle = {
  border: "1px solid #e0e6eb",
  borderRadius: 8,
  boxShadow: "0 4px 16px rgba(16, 24, 40, 0.12)",
};

function ChartHeading({ title, subtitle }) {
  return (
    <div className="dashboard-chart-heading">
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </div>
  );
}

function DashboardCharts({
  activityData,
  hasRecentActivity,
  stockHealth,
  activeItemCount,
  topSellingItems,
}) {
  return (
    <div className="dashboard-chart-grid">
      <section className="dashboard-chart-panel" style={panelStyle}>
        <ChartHeading
          title="Stock activity"
          subtitle="Units sold and received over the last seven days"
        />
        {hasRecentActivity ? (
          <div className="dashboard-chart-plot" aria-label="Stock activity chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={activityData}
                margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
              >
                <CartesianGrid vertical={false} stroke="#edf0f2" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#667085", fontSize: 12 }}
                />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#667085", fontSize: 12 }}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12, color: "#667085" }} />
                <Line
                  type="monotone"
                  dataKey="sales"
                  name="Units sold"
                  stroke="#167d68"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "#167d68" }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="purchases"
                  name="Units received"
                  stroke="#d58a20"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "#d58a20" }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="dashboard-chart-empty">
            No sales or purchases recorded in the last seven days.
          </div>
        )}
      </section>

      <section className="dashboard-chart-panel" style={panelStyle}>
        <ChartHeading
          title="Stock health"
          subtitle="Active items compared with reorder levels"
        />
        {activeItemCount ? (
          <div className="stock-health-layout">
            <div className="stock-health-chart">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stockHealth}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={58}
                    outerRadius={82}
                    paddingAngle={3}
                    stroke="none"
                  >
                    {stockHealth.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="stock-health-center">
                <strong>{activeItemCount}</strong>
                <span>active SKUs</span>
              </div>
            </div>
            <ul className="stock-health-legend">
              {stockHealth.map((entry) => (
                <li key={entry.name}>
                  <span
                    className="stock-health-swatch"
                    style={{ background: entry.color }}
                  />
                  <span>{entry.name}</span>
                  <strong>{entry.value}</strong>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="dashboard-chart-empty">
            Add active items to see stock health.
          </div>
        )}
      </section>

      <section
        className="dashboard-chart-panel dashboard-chart-wide"
        style={panelStyle}
      >
        <ChartHeading
          title="Sales ranking"
          subtitle="All active items ranked by units sold in the last 30 days"
        />
        {topSellingItems.length ? (
          <>
            {!topSellingItems.some((item) => item.units > 0) && (
              <p className="dashboard-chart-note">
                No sales in the last 30 days. All active items are shown with
                zero units.
              </p>
            )}
            <div className="dashboard-chart-scroll">
              <div
                className="dashboard-chart-plot dashboard-chart-ranked"
                style={{ height: Math.max(250, topSellingItems.length * 38) }}
                aria-label="All active items ranked by units sold"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={topSellingItems}
                    layout="vertical"
                    margin={{ top: 4, right: 18, left: 0, bottom: 4 }}
                  >
                    <CartesianGrid horizontal={false} stroke="#edf0f2" />
                    <XAxis
                      type="number"
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "#667085", fontSize: 12 }}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={150}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "#475467", fontSize: 12 }}
                    />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar
                      dataKey="units"
                      name="Units sold"
                      fill="#167d68"
                      radius={[0, 4, 4, 0]}
                      barSize={18}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        ) : (
          <div className="dashboard-chart-empty">
            Add active items to see the sales ranking.
          </div>
        )}
      </section>
    </div>
  );
}

export default DashboardCharts;