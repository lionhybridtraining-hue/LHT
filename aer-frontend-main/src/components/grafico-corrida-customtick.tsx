import React from "react";

interface CustomTickProps {
  x: number;
  y: number;
  payload: { value: string };
}

const CustomTick: React.FC<CustomTickProps> = ({ x, y, payload }) => {
  return (
    <text x={x} y={y} textAnchor="middle" fill="#8884d8">
      {payload.value}
    </text>
  );
};

export default CustomTick;
