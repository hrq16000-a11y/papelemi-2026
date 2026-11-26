import { Badge } from "@/emp-orio/components/ui/badge";
import type { ForecastConfidence } from "@/emp-orio/lib/futureForecastEngine";

export default function StrategicConfidenceBadge({ confidence }: { confidence: ForecastConfidence }) {
  const variant =
    confidence.reliability === "very_high" ? "default" :
    confidence.reliability === "high" ? "secondary" :
    confidence.reliability === "medium" ? "outline" : "destructive";
  return (
    <Badge variant={variant as any}>
      Confiança: {confidence.score} ({confidence.reliability})
    </Badge>
  );
}
