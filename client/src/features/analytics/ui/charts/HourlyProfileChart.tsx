import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

const CHART_CONFIG: ChartConfig = {
  views: { label: 'Consultations', color: '#093EAA' },
};

const formatHour = (hour: number | string) => `${String(hour).padStart(2, '0')}h`;

export function HourlyProfileChart({ profile }: { profile: { hour: number; views: number }[] }) {
  return (
    <ChartContainer config={CHART_CONFIG} className="h-[200px] w-full">
      <BarChart data={profile} margin={{ left: 4, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
        <XAxis
          dataKey="hour"
          tickFormatter={formatHour}
          tickLine={false}
          axisLine={false}
          interval={2}
          tick={{ fontSize: 10 }}
        />
        <YAxis tickLine={false} axisLine={false} allowDecimals={false} tick={{ fontSize: 10 }} />
        {/* The tooltip labels itself from the series config, not the x value, unless that value is a string. */}
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_label, items) =>
                formatHour((items?.[0]?.payload as { hour?: number } | undefined)?.hour ?? 0)
              }
            />
          }
        />
        <Bar dataKey="views" fill="var(--color-views)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
