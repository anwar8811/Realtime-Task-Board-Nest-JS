import { redirect } from "next/navigation";

export default function Home() {
  // No real landing page in v1 — bounce straight to /login. The /tasks
  // route (once authenticated) is reachable from there; /tasks itself
  // redirects unauthenticated visitors back to /login (STORY-005 AC).
  redirect("/login");
}
