import { FC } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Text, Paper, Center } from "@mantine/core";
import { Trans } from "@lingui/macro";
import { ReserveAssetDataItem } from "../hooks/useAaveData"; // Adjust path as needed
import LocalizedFiatDisplay from "./LocalizedFiatDisplay"; // Adjust path as needed

interface SuppliedAssetsPieChartProps {
  userReservesData: ReserveAssetDataItem[];
}

const COLORS = [
  "#0088FE",
  "#00C49F",
  "#FFBB28",
  "#FF8042",
  "#A28BFE",
  "#FF4560",
  "#775DD0",
  "#00E396",
  "#FEB019",
  "#FF6B6B",
  "#4BC0C0",
  "#9966FF",
];

const CustomTooltip: FC<any> = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const totalSuppliedUSD = payload[0].payload.totalSuppliedUSD; // Assuming this is passed or calculated
    const percentage = totalSuppliedUSD > 0 ? ((data.value / totalSuppliedUSD) * 100).toFixed(2) : 0;
    return (
      <Paper shadow="md" p="sm" withBorder style={{ fontSize: '12px' }}>
        <Text fw={700} fz="sm">{data.name}</Text>
        <Text fz="xs">
          <LocalizedFiatDisplay valueUSD={data.value} /> ({percentage}%)
        </Text>
      </Paper>
    );
  }
  return null;
};

const SuppliedAssetsPieChart: FC<SuppliedAssetsPieChartProps> = ({
  userReservesData,
}) => {
  if (!userReservesData || userReservesData.length === 0) {
    return (
      <Center mt="md" mb="md">
        <Text>
          <Trans>No supplied assets to display in the chart.</Trans>
        </Text>
      </Center>
    );
  }

  const totalSuppliedUSD = userReservesData.reduce(
    (sum, asset) => sum + asset.underlyingBalanceUSD,
    0
  );

  const chartData = userReservesData.map((asset) => ({
    name: asset.asset.symbol,
    value: asset.underlyingBalanceUSD,
    totalSuppliedUSD: totalSuppliedUSD, // Pass this for percentage calculation in tooltip
  }));

  return (
    <Paper p="md" mt="lg" withBorder bg="#282a2e">
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            labelLine={false}
            outerRadius={80}
            fill="#8884d8"
            dataKey="value"
            nameKey="name"
          >
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={COLORS[index % COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} wrapperStyle={{ zIndex: 1050 }}/>
          <Legend
            verticalAlign="bottom"
            align="center"
            height={36}
            iconSize={10}
            wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}
            payloadType="circle"
          />
        </PieChart>
      </ResponsiveContainer>
    </Paper>
  );
};

export default SuppliedAssetsPieChart;
