import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import type { TrafficSeriesPoint } from '@/lib/api';
import { formatDayLabel } from '../../format';

const CHART_CONFIG: ChartConfig = {
  views: { label: 'Consultations', color: '#093EAA' },
  unique_visitors: { label: 'Visiteurs uniques', color: '#6FC3A5' },
};

export function TrafficTrendChart({ series }: { series: TrafficSeriesPoint[] }) {
  return (
    <ChartContainer config={CHART_CONFIG} className="h-[220px] w-full">
      <AreaChart data={series} margin={{ left: 4, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
        <XAxis
          dataKey="date"
          tickFormatter={formatDayLabel}
          tickLine={false}
          axisLine={false}
          minTickGap={28}
          tick={{ fontSize: 10 }}
        />
        <YAxis tickLine={false} axisLine={false} allowDecimals={false} tick={{ fontSize: 10 }} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={formatDayLabel} />} />
        <Area
          type="monotone"
          dataKey="views"
          stroke="var(--color-views)"
          fill="var(--color-views)"
          fillOpacity={0.12}
          strokeWidth={2}
        />
        <Area
          type="monotone"
          dataKey="unique_visitors"
          stroke="var(--color-unique_visitors)"
          fill="var(--color-unique_visitors)"
          fillOpacity={0.12}
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  );
}
