import type { Metadata } from "next";
import AdminLoginClient from "./admin-login-client";

export const metadata: Metadata = {
  title: "Admin Login",
  description: "Establish an authenticated admin session for Arc dashboard access.",
};

export default function AdminLoginPage() {
  return <AdminLoginClient />;
}
