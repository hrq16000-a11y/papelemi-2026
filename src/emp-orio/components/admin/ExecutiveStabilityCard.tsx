import { Card, CardContent, CardHeader, CardTitle } from "@/emp-orio/components/ui/card";
import { Badge } from "@/emp-orio/components/ui/badge";
import { Progress } from "@/emp-orio/components/ui/progress";
import type { ExecutiveSummary } from "@/emp-orio/lib/executiveStability";

export default function ExecutiveStabilityCard({ summary }: { summary: ExecutiveSummary }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Executive Stability <Badge>{summary.verdict}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="text-3xl font-semibold">{summary.score}<span className="text-base text-muted-foreground">/100</span></div>
        <p className="text-muted-foreground">{summary.headline}</p>
        <Row label="Consistency" value={summary.consistency} />
        <Row label="Instability" value={summary.instability} />
        <Row label="Overload" value={summary.overload} />
        <Row label="Volatility" value={summary.volatility} />
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between mb-1"><span>{label}</span><span>{value}</span></div>
      <Progress value={value} />
    </div>
  );
}
