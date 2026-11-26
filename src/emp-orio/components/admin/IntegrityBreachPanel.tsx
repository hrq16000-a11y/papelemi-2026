import { Card, CardContent, CardHeader, CardTitle } from "@/emp-orio/components/ui/card";
import { Badge } from "@/emp-orio/components/ui/badge";
import type { IntegrityBreach } from "@/emp-orio/lib/systemicIntegrity";

interface Props { breaches: IntegrityBreach[]; recoveryDifficulty: number }
export default function IntegrityBreachPanel({ breaches, recoveryDifficulty }: Props) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Integrity Breaches · recovery {recoveryDifficulty}</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm">
        {breaches.length === 0 && <p className="text-muted-foreground">Sem violações detectadas.</p>}
        {breaches.map((b, i) => (
          <div key={i} className="border rounded p-2 flex items-center justify-between">
            <div>
              <strong>{b.area}</strong>
              <p className="text-muted-foreground text-xs">{b.reason}</p>
            </div>
            <Badge variant="outline">sev {b.severity}</Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
