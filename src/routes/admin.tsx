import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import EmporioAdminApp from "@/emp-orio/EmporioAdminApp";
import "@/emp-orio/admin-theme.css";

function AdminClientOnly() {
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  return ready ? <EmporioAdminApp /> : <div className="min-h-screen bg-background" aria-busy="true" />;
}

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Painel administrativo — PapeLemi" }, { name: "description", content: "Gestão operacional da PapeLemi." }, { name: "robots", content: "noindex, nofollow" }] }),
  component: () => <div className="emp-orio-admin"><AdminClientOnly /></div>,
});