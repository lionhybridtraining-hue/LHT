import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Label,
  LabelList,
} from "recharts";
// import CustomTick from "./grafico-corrida-customtick";uii

type GraficoPaceProps = {
  data: {
    km: number;
    pace_s: number;
    pace: string;
    km_h: number;
  }[];
};

export default function GraficoPace({ data }: GraficoPaceProps) {
  // Extract unique 'km' values for X-axis ticks
  const xAxisTicks = Array.from(new Set(data.map((item) => item.km)));
  console.log(data);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={data}
        margin={{
          top: 25,
          right: 30,
          left: -50,
          bottom: 0,
        }}
      >
        <XAxis
          dataKey="km"
          type="number"
          tickSize={2}
          ticks={xAxisTicks}
          domain={[0, "dataMax"]}
        >
          <Label
            position="right"
            value={"km"}
            dy={-15}
            dx={3}
            style={{ fontWeight: "bold" }}
          />
        </XAxis>
        <YAxis name="km/h" tick={false}>
          <Label
            value={"pace"}
            dx={40}
            dy={-10}
            position="top"
            style={{ fontWeight: "bold" }}
          />
        </YAxis>
        <defs>
          <linearGradient
            id={`colorUv`}
            x1="0"
            y1="100%"
            x2="0"
            y2="0"
            spreadMethod="reflect"
          >
            <stop offset="5%" stopColor="#1E88E5" stopOpacity={0} />
            <stop offset="45%" stopColor="#1E88E5" stopOpacity={0.7} />
            <stop offset="95%" stopColor="#1E88E5" stopOpacity={1} />
          </linearGradient>
        </defs>
        <Area
          type="stepBefore"
          dataKey="km_h"
          stroke="#1E88E5"
          fill={`url(#colorUv)`}
        >
          <LabelList
            dataKey="pace"
            position="top"
            dx={-5}
            style={{ fill: "#000", fontSize: 12 }}
          />
        </Area>
      </AreaChart>
    </ResponsiveContainer>
  );
}
