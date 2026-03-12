"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useI18n } from "@/components/i18n/I18nProvider";

const data = [
  { name: "Jan", value: 18 },
  { name: "Feb", value: 22 },
  { name: "Mar", value: 19 },
  { name: "Apr", value: 28 },
  { name: "May", value: 24 },
  { name: "Jun", value: 31 },
];

export function TrendChartCard() {
  const { t } = useI18n();

  return (
    <div className="rounded-3xl border border-zinc-200/70 bg-white/75 p-5 shadow-xl shadow-sky-100/50 backdrop-blur ring-1 ring-zinc-200/40">
      <div className="text-sm font-semibold text-zinc-900">{t("dashboardPage.chartTitle")}</div>
      <div className="mt-1 text-xs text-zinc-500">{t("dashboardPage.chartDesc")}</div>

      <div className="mt-4 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="trend" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" />
            <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} stroke="#71717a" />
            <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="#71717a" width={24} />
            <Tooltip
              contentStyle={{
                borderRadius: 16,
                borderColor: "#e4e4e7",
                boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
              }}
            />
            <Area type="monotone" dataKey="value" stroke="#4f46e5" strokeWidth={2} fill="url(#trend)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
