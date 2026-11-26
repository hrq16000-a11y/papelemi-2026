import { Card, CardContent, CardHeader, CardTitle } from "@/emp-orio/components/ui/card";
import { Progress } from "@/emp-orio/components/ui/progress";
import { Badge } from "@/emp-orio/components/ui/badge";

export interface ClusterDep {
  cluster: string;
  share: number;
  risk: "low" | "medium" | "high";
}

export function ClusterDependencyPanel({ items }: { items: ClusterDep[] }) {
  return (
    <Card>
      <CardHeader><CardTitle>Dependência por Cluster</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 && <p className="text-sm text-muted-foreground">Sem dados.</p>}
        {items.map((c) => (
          <div key={c.cluster} className="space-y-1">
            <div className="flex justify-between items-center text-sm">
              <span className="font-medium">{c.cluster}</span>
              <Badge variant={c.risk === "high" ? "destructive" : c.risk === "medium" ? "secondary" : "default"}>
                {c.share}%
              </Badge>
            </div>
            <Progress value={c.share} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
