import { NextResponse } from "next/server";
import { RESULTS_ID, searchMail } from "@/src/engine/mailbox.ts";
import { getMailAccount } from "@/src/engine/settings.ts";
import { jsonError } from "../_lib/respond.ts";
import { mailView } from "../_lib/mail.ts";

/** Recent mail in the agent inbox (the account chosen in General settings), newest first — minus closing results, which the Results page already lists from their filed copies. */
export async function GET() {
  if (!getMailAccount()) return NextResponse.json([]);
  try {
    return NextResponse.json((await searchMail("in:inbox")).filter((m) => m.jobId !== RESULTS_ID).map(mailView));
  } catch (err) {
    return jsonError(502, (err as Error).message);
  }
}
