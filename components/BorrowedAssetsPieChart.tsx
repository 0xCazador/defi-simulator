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
import { BorrowedAssetDataItem } from "../hooks/useAaveData"; // Adjust path as needed
import LocalizedFiatDisplay from "./LocalizedFiatDisplay"; // Adjust path as needed

interface BorrowedAssetsPieChartProps {
  userBorrowsData: BorrowedAssetDataItem[];
}

const COLORS = [
  "#FF8042",
  "#FFBB28",
  "#00C49F",
  "#0088FE",
  "#FF4560",
  "#A28BFE",
  "#00E396",
  "#775DD0",
  "#FF6B6B",
  "#FEB019",
  "#9966FF",
  "#4BC0C0",
];

const CustomTooltip: FC<any> = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const totalBorrowedUSD = payload[0].payload.totalBorrowedUSD;
    const percentage = totalBorrowedUSD > 0 ? ((data.value / totalBorrowedUSD) * 100).toFixed(2) : 0;
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

const BorrowedAssetsPieChart: FC<BorrowedAssetsPieChartProps> = ({
  userBorrowsData,
}) => {
  if (!userBorrowsData || userBorrowsData.length === 0) {
    return (
      <Center mt="md" mb="md">
        <Text>
          <Trans>No borrowed assets to display in the chart.</Trans>
        </Text>
      </Center>
    );
  }

  const totalBorrowedUSD = userBorrowsData.reduce(
    (sum, asset) => sum + asset.totalBorrowsUSD,
    0
  );

  const chartData = userBorrowsData.map((asset) => ({
    name: asset.asset.symbol,
    value: asset.totalBorrowsUSD,
    totalBorrowedUSD: totalBorrowedUSD, // Pass this for percentage calculation in tooltip
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
          <Tooltip content={<CustomTooltip />} wrapperStyle={{ zIndex: 1050 }} />
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

export default BorrowedAssetsPieChart;
