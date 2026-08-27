import { NextResponse } from "next/server";
import { getDocs } from "@/lib/docs/load";

export async function GET() {
  try {
    return NextResponse.json({ docs: getDocs() });
  } catch (error) {
    console.error("Error reading docs:", error);
    return NextResponse.json({ docs: [], error: "Failed to load docs" }, { status: 500 });
  }
}
