"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type BurndownPoint = {
  date: string;
  ideal: number;
  actual: number | null;
};

type VelocityPoint = {
  name: string;
  completed: number;
  capacity: number;
};

export function SprintCharts({
  burndown,
  velocity,
}: {
  burndown: BurndownPoint[];
  velocity: VelocityPoint[];
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="ac-card p-4">
        <div className="flex items-end justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">Sprint 燃尽图</h2>
            <p className="mt-0.5 text-xs text-ink-faint">理想线 vs 实际剩余故事点</p>
          </div>
        </div>
        <div className="mt-4 h-72">
          {burndown.length === 0 ? (
            <Empty text="暂无燃尽数据。" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={burndown} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8e3d8" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={20} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="ideal"
                  name="理想剩余"
                  stroke="#928b7e"
                  strokeDasharray="5 5"
                  dot={false}
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="actual"
                  name="实际剩余"
                  stroke="#294a78"
                  connectNulls={false}
                  dot={{ r: 2 }}
                  strokeWidth={2.5}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="ac-card p-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Sprint 速度</h2>
          <p className="mt-0.5 text-xs text-ink-faint">已关闭 Sprint 的完成故事点与容量</p>
        </div>
        <div className="mt-4 h-72">
          {velocity.length === 0 ? (
            <Empty text="关闭至少一个 Sprint 后生成速度图。" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={velocity} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8e3d8" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="capacity" name="容量" fill="#d8d1c2" radius={[4, 4, 0, 0]} />
                <Bar dataKey="completed" name="已完成" fill="#3f7a58" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="grid h-full place-items-center rounded-field border border-dashed border-line-strong bg-sunken/40 text-sm text-ink-faint">
      {text}
    </div>
  );
}
