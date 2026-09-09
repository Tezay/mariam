import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { formatDayLabel } from '../../format';

const formatHour = (hour: number | string) => `${String(hour).padStart(2, '0')}h`;

const CHART_CONFIG: ChartConfig = {
  score: { label: 'Score moyen', color: '#093EAA' },
};

export function SatisfactionTrendChart({
  series,
  granularity = 'day',
}: {
  series: { date?: string; hour?: number; score: number | null }[];
  granularity?: 'day' | 'hour';
}) {
  const byHour = granularity === 'hour';
  return (
    <ChartContainer config={CHART_CONFIG} className="h-[200px] w-full">
      <LineChart data={series} margin={{ left: 4, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
        <XAxis
          dataKey={byHour ? 'hour' : 'date'}
          tickFormatter={byHour ? formatHour : formatDayLabel}
          tickLine={false}
          axisLine={false}
          minTickGap={byHour ? 12 : 28}
          tick={{ fontSize: 10 }}
        />
        <YAxis
          domain={[1, 3]}
          ticks={[1, 2, 3]}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10 }}
        />
        {/* The tooltip labels itself from the series config, not the x value, unless that value is a string. */}
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(label, items) =>
                byHour
                  ? formatHour((items?.[0]?.payload as { hour?: number } | undefined)?.hour ?? 0)
                  : formatDayLabel(String(label))
              }
            />
          }
        />
        <Line
          type="monotone"
          dataKey="score"
          stroke="var(--color-score)"
          strokeWidth={2}
          dot={false}
          connectNulls
        />
      </LineChart>
    </ChartContainer>
  );
}
