import { expect, test } from "@playwright/test";

import { getTenantAId, ingestTransactionForE2E } from "./helpers";

test.describe("Review queue override flow", () => {
  test("ingest → review queue → accountant override", async ({ page, request }) => {
    const tenantId = await getTenantAId(request);
    const transactionId = await ingestTransactionForE2E(
      request,
      tenantId,
      "MYSTERY VENDOR E2E",
    );

    await page.goto(`/review-queue`);
    await expect(page.getByRole("heading", { name: "Review queue" })).toBeVisible();

    await expect(page.getByText("MYSTERY VENDOR E2E")).toBeVisible({ timeout: 20_000 });

    await page.getByRole("link", { name: /Why & override/i }).first().click();

    await expect(page).toHaveURL(new RegExp(`/transactions/${transactionId}`));

    await page.getByLabel(/GL code/i).fill("6100");
    await page.getByRole("button", { name: "Apply override" }).click();

    await expect(page.getByText(/Override applied/i)).toBeVisible({ timeout: 15_000 });
  });
});
