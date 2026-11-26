import { Card, CardContent, CardHeader, CardTitle } from "@/emp-orio/components/ui/card";
import { Progress } from "@/emp-orio/components/ui/progress";

export default function MaintainabilityScoreCard({ score, cycles, leaks, unused }: {
  score: number; cycles: number; leaks: number; unused: number;
}) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Maintainability</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="text-3xl font-bold">{score}</div>
        <Progress value={score} />
        <div className="flex justify-between"><span className="text-muted-foreground">Ciclos</span><b>{cycles}</b></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Leaks entre camadas</span><b>{leaks}</b></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Engines não usadas</span><b>{unused}</b></div>
      </CardContent>
    </Card>
  );
}
