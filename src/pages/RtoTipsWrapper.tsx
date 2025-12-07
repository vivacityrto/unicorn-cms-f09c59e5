import { ProtectedRoute } from "@/components/ProtectedRoute";
import RtoTips from "./RtoTips";

export default function RtoTipsWrapper() {
  return (
    <ProtectedRoute>
      <RtoTips />
    </ProtectedRoute>
  );
}
