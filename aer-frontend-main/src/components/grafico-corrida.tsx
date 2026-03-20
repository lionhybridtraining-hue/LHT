import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Label,
  ReferenceLine,
} from "recharts";
import { useEffect, useState } from "react";
// import CustomTick from "./grafico-corrida-customtick";uii

type GraficoPaceProps = {
  data: {
    km: number;
    pace_s: number;
    pace: string;
    km_h: number;
  }[];
};

function formatPaceFromKmH(kmH: number): string {
  if (!Number.isFinite(kmH) || kmH <= 0) {
    return "--:--";
  }

  const totalSeconds = Math.round(3600 / kmH);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function buildSparseTicks(values: number[], maxTicks: number): number[] {
  if (values.length <= maxTicks) {
    return values;
  }

  const result: number[] = [];
  const step = (values.length - 1) / (maxTicks - 1);

  for (let index = 0; index < maxTicks; index += 1) {
    const sourceIndex = Math.round(index * step);
    result.push(values[sourceIndex]);
  }

  return Array.from(new Set(result));
}

export default function GraficoPace({ data }: GraficoPaceProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const updateViewport = () => setIsMobile(mediaQuery.matches);

    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);

    return () => {
      mediaQuery.removeEventListener("change", updateViewport);
    };
  }, []);

  // Extract unique 'km' values for X-axis ticks
  const xAxisTicks = buildSparseTicks(
    Array.from(new Set(data.map((item) => item.km))),
    8
  );
  const yAxisTicks = Array.from(
    new Set(
      data
        .map((item) => item.pace_s)
        .filter((value) => Number.isFinite(value) && value > 0)
        .map((paceSeconds) => Number((3600 / paceSeconds).toFixed(3)))
    )
  ).sort((left, right) => left - right);
  const yMax = yAxisTicks.length > 0 ? Math.max(...yAxisTicks) : 0;
  const yTopPadding =
    yAxisTicks.length > 1 ? Math.max(yMax * 0.04, 0.12) : Math.max(yMax * 0.05, 0.12);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={data}
        margin={{
          top: isMobile ? 10 : 20,
          right: isMobile ? 10 : 48,
          left: isMobile ? 2 : 8,
          bottom: isMobile ? 2 : 12,
        }}
      >
        {!isMobile &&
          yAxisTicks.map((paceTick) => (
            <ReferenceLine
              key={`pace-grid-${paceTick}`}
              y={paceTick}
              stroke="#5a5a5a"
              strokeOpacity={0.35}
              strokeDasharray="4 4"
              ifOverflow="extendDomain"
            />
          ))}
        <XAxis
          dataKey="km"
          type="number"
          hide={isMobile}
          tickSize={2}
          ticks={xAxisTicks}
          interval={0}
          minTickGap={0}
          domain={[0, "dataMax"]}
          tick={{ fill: "#c9ced9", fontSize: 11 }}
          axisLine={{ stroke: "#5a5a5a" }}
          tickLine={{ stroke: "#5a5a5a" }}
          tickMargin={8}
        >
          <Label
            position="insideBottomRight"
            value={"km"}
            dy={14}
            dx={8}
            style={{ fontWeight: "bold", fill: "#d4a54f" }}
          />
        </XAxis>
        <YAxis
          name="pace"
          type="number"
          hide={isMobile}
          ticks={yAxisTicks}
          interval={0}
          domain={[0, yMax + yTopPadding]}
          tickFormatter={formatPaceFromKmH}
          tick={{ fill: "#c9ced9", fontSize: 11 }}
          axisLine={{ stroke: "#5a5a5a" }}
          tickLine={{ stroke: "#5a5a5a" }}
          width={56}
          tickMargin={6}
        />
        <defs>
          <linearGradient
            id={`colorBase`}
            x1="0"
            y1="100%"
            x2="0"
            y2="0"
            spreadMethod="reflect"
          >
            <stop offset="5%" stopColor="#d4a54f" stopOpacity={0} />
            <stop offset="45%" stopColor="#d4a54f" stopOpacity={0.55} />
            <stop offset="95%" stopColor="#d4a54f" stopOpacity={0.85} />
          </linearGradient>
        </defs>
        <Area
          type="stepBefore"
          dataKey="km_h"
          stroke="#d4a54f"
          fill={`url(#colorBase)`}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
