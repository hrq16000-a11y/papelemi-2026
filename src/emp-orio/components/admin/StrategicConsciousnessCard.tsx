import { Card, CardContent, CardHeader, CardTitle } from "@/emp-orio/components/ui/card";
import { Badge } from "@/emp-orio/components/ui/badge";
import type { ConsciousnessVerdict } from "@/emp-orio/lib/strategicConsciousness";

interface Props { score: number; verdict: ConsciousnessVerdict; summary: string; strengths: string[]; }
export default function StrategicConsciousnessCard({ score, verdict, summary, strengths }: Props) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Strategic Consciousness</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        <div className="text-4xl font-bold">{score}</div>
        <Badge variant="outline">{verdict}</Badge>
        <p className="text-sm text-muted-foreground">{summary}</p>
        {strengths.length > 0 && (
          <ul className="text-sm space-y-0.5 mt-2">
            {strengths.map((s, i) => <li key={i}>• {s}</li>)}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
