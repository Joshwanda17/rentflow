/**
 * Shared requisition -> wallet credit engine.
 *
 * Guarantees:
 *  - only APPROVED requisitions are credited
 *  - a requisition can be credited exactly once (unique row in
 *    public.requisition_wallet_credits acts as the idempotency lock)
 *  - a failed credit leaves a retryable `failed` row, never a duplicate credit
 *  - every credit posts a full double-entry ledger transaction through
 *    cfo-direct-credit (recipient_type: 'user' -> withdrawable bucket)
 */
import { sendSMS } from "./sendSmsMultiProvider.ts";

// deno-lint-ignore no-explicit-any
type Admin = any;

export interface RequisitionCreditInput {
  admin: Admin;
  sourceTable: "director_requisitions" | "employee_requisitions";
  requisitionId: string;
  requisitionCode: string;
  userId: string;            // requester (never the approver)
  approverId: string | null;
  approverName?: string | null;
  amount: number;
  currency?: string;
  purpose: string;
  category?: string | null;
  status: string;            // current requisition status, must be 'approved'
  approvedAt?: string | null;
  ipAddress?: string | null;
  deviceInfo?: string | null;
}

export interface RequisitionCreditResult {
  ok: boolean;
  already_credited?: boolean;
  wallet_transaction_id?: string | null;
  message: string;
  error?: string;
}

function fmtUGX(n: number) {
  return `UGX ${Math.round(n).toLocaleString("en-US")}`;
}

export async function creditRequisitionWallet(
  input: RequisitionCreditInput,
): Promise<RequisitionCreditResult> {
  const {
    admin, sourceTable, requisitionId, requisitionCode, userId, approverId,
    approverName, purpose, category, status, approvedAt, ipAddress, deviceInfo,
  } = input;
  const amount = Math.round(Number(input.amount) * 100) / 100;
  const currency = input.currency || "UGX";

  // 5. Validation — only approved requisitions may be credited.
  if (status !== "approved") {
    return { ok: false, message: `Requisition is ${status}; only approved requisitions can be credited.`, error: "not_approved" };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, message: "Invalid requisition amount.", error: "invalid_amount" };
  }
  if (!userId) {
    return { ok: false, message: "No requester account is linked to this requisition.", error: "no_recipient" };
  }

  // Wallet must exist for the requester.
  const { data: wallet } = await admin.from("wallets").select("user_id").eq("user_id", userId).maybeSingle();
  if (!wallet) {
    await recordFailure(admin, input, "Wallet not found for requester");
    return { ok: false, message: "This user has no Welile Wallet yet, so the credit was not processed.", error: "wallet_missing" };
  }

  // 4. Idempotency lock — unique (source_table, requisition_id).
  const { data: lock, error: lockErr } = await admin
    .from("requisition_wallet_credits")
    .insert({
      source_table: sourceTable,
      requisition_id: requisitionId,
      requisition_code: requisitionCode,
      user_id: userId,
      approver_id: approverId,
      amount,
      currency,
      status: "pending",
      approved_at: approvedAt ?? new Date().toISOString(),
      ip_address: ipAddress ?? null,
      device_info: deviceInfo ?? null,
      metadata: { purpose, category },
    })
    .select("id, status, wallet_transaction_id")
    .maybeSingle();

  let creditRowId: string | null = lock?.id ?? null;

  if (lockErr) {
    const msg = String(lockErr.message || "");
    if (!msg.includes("duplicate key") && !msg.includes("requisition_wallet_credits_unique")) {
      return { ok: false, message: "Could not start the wallet credit.", error: msg };
    }
    const { data: existing } = await admin
      .from("requisition_wallet_credits")
      .select("id, status, wallet_transaction_id, attempt_count")
      .eq("source_table", sourceTable)
      .eq("requisition_id", requisitionId)
      .maybeSingle();

    if (existing?.status === "credited") {
      return {
        ok: true,
        already_credited: true,
        wallet_transaction_id: existing.wallet_transaction_id,
        message: "This requisition has already been credited to the wallet. No further funding was processed.",
      };
    }
    // pending or failed -> retry this same row, never a second one.
    creditRowId = existing?.id ?? null;
    await admin.from("requisition_wallet_credits")
      .update({ status: "pending", error_message: null, attempt_count: (existing?.attempt_count ?? 1) + 1, approver_id: approverId })
      .eq("id", creditRowId);
  }

  // 2 + 3. Wallet credit + double-entry ledger transaction.
  let walletTxId: string | null = null;
  try {
    const { data: cc, error: ccErr } = await admin.functions.invoke("cfo-direct-credit", {
      body: {
        target_user_id: userId,
        amount,
        operation: "credit",
        recipient_type: "user",
        wallet_category: "payroll_expense",
        platform_category: "payroll_expense",
        financial_impact: "expense",
        category_label: "Requisition Credit",
        sub_category: category || "requisition",
        reason: `Requisition ${requisitionCode}: ${purpose}`,
        manual_credit: true,
      },
    });
    const err = ccErr?.message || (cc as { error?: string })?.error;
    if (err) throw new Error(err);
    walletTxId = (cc as { reference_id?: string })?.reference_id ?? null;
  } catch (e) {
    const message = String((e as Error).message ?? e);
    await admin.from("requisition_wallet_credits")
      .update({ status: "failed", error_message: message })
      .eq("id", creditRowId);
    await admin.from(sourceTable)
      .update({ wallet_credit_status: "failed" })
      .eq("id", requisitionId);
    await notifyAdminsOfFailure(admin, requisitionCode, amount, message);
    await admin.from("audit_logs").insert({
      user_id: approverId,
      action_type: "requisition_wallet_credit_failed",
      table_name: sourceTable,
      record_id: requisitionId,
      reason: message.slice(0, 200) || "Wallet credit failed",
      metadata: { requisition_code: requisitionCode, amount, user_id: userId, approver_id: approverId, ip_address: ipAddress, device_info: deviceInfo },
    }).catch(() => {});
    return { ok: false, message: "Approved — wallet credit failed. Administrators have been notified and the credit can be retried.", error: message };
  }

  const creditedAt = new Date().toISOString();
  await admin.from("requisition_wallet_credits")
    .update({ status: "credited", wallet_transaction_id: walletTxId, credited_at: creditedAt, error_message: null })
    .eq("id", creditRowId);
  await admin.from(sourceTable)
    .update({
      wallet_credit_status: "credited",
      wallet_transaction_id: walletTxId,
      credited_at: creditedAt,
      credited_by: approverId,
    })
    .eq("id", requisitionId);

  // 7. Audit trail.
  await admin.from("audit_logs").insert({
    user_id: approverId,
    action_type: "requisition_wallet_credited",
    table_name: sourceTable,
    record_id: requisitionId,
    reason: `Requisition ${requisitionCode} credited ${fmtUGX(amount)}`,
    metadata: {
      requisition_id: requisitionId,
      requisition_code: requisitionCode,
      wallet_transaction_id: walletTxId,
      user_id: userId,
      approver_id: approverId,
      approver_name: approverName,
      amount,
      currency,
      approved_at: approvedAt,
      credited_at: creditedAt,
      ip_address: ipAddress,
      device_info: deviceInfo,
    },
  }).catch(() => {});

  // 6. Notifications (best-effort, never roll back a posted credit).
  const message = `Your requisition has been approved and ${fmtUGX(amount)} has been credited to your Welile Wallet.`;
  const { data: profile } = await admin.from("profiles").select("full_name, phone, email").eq("id", userId).maybeSingle();

  await admin.from("notifications").insert({
    user_id: userId,
    type: "requisition_wallet_credit",
    title: `Requisition ${requisitionCode} funded`,
    message,
    metadata: { requisition_id: requisitionId, wallet_transaction_id: walletTxId, amount },
  }).catch(() => {});

  if (profile?.email) {
    await admin.functions.invoke("send-email", {
      body: {
        to: profile.email,
        subject: `Requisition ${requisitionCode} — wallet credited`,
        html: `<p>Hello ${profile.full_name || "there"},</p><p>${message}</p><p>Reference: <b>${walletTxId ?? requisitionCode}</b></p>`,
      },
    }).catch((e: unknown) => console.error("requisition credit email failed", e));
  }

  if (profile?.phone) {
    await sendSMS(profile.phone, `Welile: ${message}`, {
      admin,
      source: "requisition-wallet-credit",
      reference_id: requisitionId,
      recipient_user_id: userId,
      recipient_name: profile.full_name,
      idempotencyKey: `req-credit-${sourceTable}-${requisitionId}`,
    }).catch((e: unknown) => console.error("requisition credit SMS failed", e));
  }

  return { ok: true, wallet_transaction_id: walletTxId, message };
}

async function recordFailure(admin: Admin, input: RequisitionCreditInput, message: string) {
  await admin.from("requisition_wallet_credits").upsert({
    source_table: input.sourceTable,
    requisition_id: input.requisitionId,
    requisition_code: input.requisitionCode,
    user_id: input.userId,
    approver_id: input.approverId,
    amount: input.amount,
    currency: input.currency || "UGX",
    status: "failed",
    error_message: message,
    ip_address: input.ipAddress ?? null,
    device_info: input.deviceInfo ?? null,
  }, { onConflict: "source_table,requisition_id" }).catch(() => {});
  await admin.from(input.sourceTable).update({ wallet_credit_status: "failed" }).eq("id", input.requisitionId).catch(() => {});
}

async function notifyAdminsOfFailure(admin: Admin, code: string, amount: number, error: string) {
  try {
    const { data: admins } = await admin
      .from("user_roles")
      .select("user_id")
      .in("role", ["cfo", "super_admin"])
      .eq("enabled", true)
      .limit(20);
    for (const a of admins || []) {
      await admin.from("notifications").insert({
        user_id: a.user_id,
        type: "requisition_wallet_credit_failed",
        title: `Wallet credit failed: ${code}`,
        message: `Requisition ${code} (${fmtUGX(amount)}) was approved but the wallet credit failed: ${error}. Retry from the requisitions dashboard.`,
        metadata: { requisition_code: code, amount, error },
      }).catch(() => {});
    }
  } catch (_) { /* non-fatal */ }
}
