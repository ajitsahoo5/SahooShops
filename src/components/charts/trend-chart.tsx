"use client";

import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatINR } from "@/lib/money";
import type { TrendPoint } from "@/server/dashboard";

function shortRupees(paise: number): string {
  const rupees = paise / 100;
  if (Math.abs(rupees) >= 1_00_000) return `₹${(rupees / 1_00_000).toFixed(1)}L`;
  if (Math.abs(rupees) >= 1_000) return `₹${(rupees / 1_000).toFixed(1)}k`;
  return `₹${Math.round(rupees)}`;
}

export function TrendChart({ data }: { data: TrendPoint[] }) {
  const rows = data.map((d) => ({ ...d, label: `${d.date.slice(8, 10)}/${d.date.slice(5, 7)}` }));
  return (
    <div className="h-72 w-full lg:h-full lg:min-h-72">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="trend-sales" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="trend-profit" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            fontSize={11}
            interval="preserveStartEnd"
            tick={{ fill: "var(--muted-foreground)" }}
          />
          <YAxis
            tickFormatter={shortRupees}
            tickLine={false}
            axisLine={false}
            fontSize={11}
            width={56}
            tick={{ fill: "var(--muted-foreground)" }}
          />
          <Tooltip
            formatter={(value, name) => [formatINR(Number(value)), String(name)]}
            labelFormatter={(label) => `Date ${label}`}
            contentStyle={{
              fontSize: 12,
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--popover)",
              color: "var(--popover-foreground)",
              boxShadow: "0 8px 24px rgb(15 23 42 / 0.08)",
            }}
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
          <Area
            dataKey="netSales"
            name="Net sales"
            type="monotone"
            stroke="var(--chart-1)"
            strokeWidth={2}
            fill="url(#trend-sales)"
          />
          <Area
            dataKey="grossProfit"
            name="Gross profit"
            type="monotone"
            stroke="var(--chart-2)"
            strokeWidth={2}
            fill="url(#trend-profit)"
          />
          <Line dataKey="expenses" name="Expenses" type="monotone" stroke="var(--chart-3)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
