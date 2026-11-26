import { createFileRoute } from "@tanstack/react-router";
import EmporioAdminApp from "@/emp-orio/EmporioAdminApp";
import "@/emp-orio/admin-theme.css";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Painel administrativo — PapeLemi" }, { name: "description", content: "Gestão operacional da PapeLemi." }, { name: "robots", content: "noindex, nofollow" }] }),
  component: () => <div className="emp-orio-admin"><EmporioAdminApp /></div>,
});