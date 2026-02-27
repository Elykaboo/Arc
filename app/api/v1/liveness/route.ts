import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "gymplanner-api",
    timestamp: new Date().toISOString(),
  });
}
