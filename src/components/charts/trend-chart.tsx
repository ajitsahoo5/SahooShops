"use client";

import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} interval="preserveStartEnd" />
          <YAxis tickFormatter={shortRupees} tickLine={false} axisLine={false} fontSize={11} width={56} />
          <Tooltip
            formatter={(value, name) => [formatINR(Number(value)), String(name)]}
            labelFormatter={(label) => `Date ${label}`}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="netSales" name="Net sales" fill="var(--chart-2)" radius={[3, 3, 0, 0]} />
          <Line dataKey="grossProfit" name="Gross profit" stroke="var(--chart-5)" strokeWidth={2} dot={false} type="monotone" />
          <Line dataKey="expenses" name="Expenses" stroke="var(--destructive)" strokeWidth={1.5} dot={false} type="monotone" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
