import { createFileRoute } from "@tanstack/react-router";
import { AdminRoute as AdminScreen } from "../../ui/admin-route.js";

export const Route = createFileRoute("/admin/$")({
  component: AdminScreen,
});
