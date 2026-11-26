import { Card, CardContent, CardHeader, CardTitle } from "@/emp-orio/components/ui/card";
import { Progress } from "@/emp-orio/components/ui/progress";

export default function AuthorityStatusPanel({ score, label = "Authority" }: { score: number; label?: string }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{label} Status</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        <div className="text-3xl font-bold">{score}</div>
        <Progress value={score} />
        <div className="text-xs text-muted-foreground">Aggregated authority signal</div>
      </CardContent>
    </Card>
  );
}
