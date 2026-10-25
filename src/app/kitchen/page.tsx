"use client";

import Kitchen from "@/components/kitchen";
import ProtectedRoute from "@/components/protected-route";

export default function KitchenPage() {
  return (
    <ProtectedRoute allowedRoles={["cook", "manager", "owner", "admin"]}>
      <KitchenContent />
    </ProtectedRoute>
  );
}

// A casca (header com o Atualizar) é montada dentro do Kitchen.
function KitchenContent() {
  return <Kitchen />;
}
