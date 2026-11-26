import { Badge } from "@/emp-orio/components/ui/badge";
import type { StabilityResult } from "@/emp-orio/lib/semanticStability";

export function SemanticStabilityBadge({ result }: { result: StabilityResult }) {
  const variant =
    result.risk === "low" ? "default" :
    result.risk === "medium" ? "secondary" :
    "destructive";
  return (
    <Badge variant={variant as any}>
      Estabilidade {result.score}/100 · {result.risk}
    </Badge>
  );
}
