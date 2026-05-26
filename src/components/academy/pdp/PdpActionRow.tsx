import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Plus, Target, ArrowRight } from "lucide-react";

interface Props {
  cycleId: number | null;
  onLogEvidence: () => void;
  onAddGoal: () => void;
}

export function PdpActionRow({ cycleId, onLogEvidence, onAddGoal }: Props) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        onClick={onLogEvidence}
        className="text-white hover:opacity-90"
        style={{ backgroundColor: "#23C0DD" }}
        disabled={!cycleId}
      >
        <Plus className="mr-2 h-4 w-4" />
        Log evidence
      </Button>
      <Button variant="secondary" onClick={onAddGoal} disabled={!cycleId}>
        <Target className="mr-2 h-4 w-4" />
        Add a goal
      </Button>
      <Button
        variant="outline"
        onClick={() => cycleId && navigate(`/academy/pdp/cycle/${cycleId}`)}
        disabled={!cycleId}
      >
        Open my PDP
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}
