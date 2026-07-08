import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  RECEIPT_ARCHIVE_EMAIL,
  buildReceiptCopyRecipients,
  enforceArchiveOnly,
} from "./receipt-copy-guard.ts";

Deno.test("archive address is weliletenants@gmail.com", () => {
  assertEquals(RECEIPT_ARCHIVE_EMAIL, "weliletenants@gmail.com");
});

Deno.test("receipt copies are sent ONLY to weliletenants@gmail.com", () => {
  const recipients = buildReceiptCopyRecipients();
  assertEquals(recipients.length, 1);
  assertEquals(recipients[0].email, "weliletenants@gmail.com");
  // No staff / manager / CFO / agent addresses may appear.
  const others = recipients.filter(
    (r) => r.email.trim().toLowerCase() !== "weliletenants@gmail.com",
  );
  assertEquals(others.length, 0);
});

Deno.test("guard strips any non-archive recipient (CFO/manager/agent)", () => {
  const { allowed, rejected } = enforceArchiveOnly([
    { email: "joshwanda17@gmail.com", role: "CFO" },
    { email: "some.manager@welile.com", role: "Manager" },
    { email: "WeliLeTenants@Gmail.com", role: "Records Archive" }, // case-insensitive
    { email: "agent@welile.com", role: "Merchant Agent" },
  ]);
  assertEquals(allowed.length, 1);
  assertEquals(allowed[0].email.trim().toLowerCase(), "weliletenants@gmail.com");
  assertEquals(rejected.length, 3);
  assert(rejected.some((r) => r.role === "CFO"));
  assert(rejected.some((r) => r.role === "Manager"));
});

Deno.test("guard is a no-op passthrough when only archive is present", () => {
  const { allowed, rejected } = enforceArchiveOnly(buildReceiptCopyRecipients());
  assertEquals(allowed.length, 1);
  assertEquals(rejected.length, 0);
});

// Source-level guard: the approve-withdrawal handler must not fan out receipt
// copies to role-derived staff addresses. It must never query user_roles for
// cfo/operations/manager to build a receipt recipient list.
Deno.test("approve-withdrawal source does not fan receipt copies to staff roles", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  // The only literal receipt-copy email in the handler must be the archive,
  // routed through the guard module.
  assert(
    src.includes("buildReceiptCopyRecipients") &&
      src.includes("enforceArchiveOnly"),
    "handler must build receipt copies via the guarded helper",
  );
  // Ensure the old role-based fan-out (cfo/operations lookup for receipts) is gone.
  assert(
    !/copyRecipients\.push\([^)]*role:\s*["']CFO["']/.test(src),
    "handler must not push CFO addresses onto receipt copy list",
  );
});
