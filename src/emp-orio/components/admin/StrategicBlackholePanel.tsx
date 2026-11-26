import { Card } from "@/emp-orio/components/ui/card";
import { Badge } from "@/emp-orio/components/ui/badge";
import type { Blackhole } from "@/emp-orio/lib/singularityEngine";

export default function StrategicBlackholePanel({ holes }: { holes: Blackhole[] }) {
  return (
    <Card className="p-4">
      <h4 className="font-medium mb-3">Blackholes Estratégicos</h4>
      <div className="space-y-2">
        {holes.length === 0 && <p className="text-xs text-muted-foreground">Nenhum blackhole detectado.</p>}
        {holes.map((h) => (
          <div key={h.key} className="flex items-center justify-between text-sm">
            <span className="truncate">{h.key}</span>
            <Badge variant={h.severity === "high" ? "destructive" : "secondary"}>×{h.effortRatio}</Badge>
          </div>
        ))}
      </div>
    </Card>
  );
}
