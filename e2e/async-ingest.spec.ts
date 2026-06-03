import { expect, test } from "@playwright/test";

test.describe("Async ingest (Settings UI)", () => {
  test("dev ingest completes processing status", async ({ page }) => {
    await page.goto("/settings");

    await expect(page.getByRole("heading", { name: "Dev ingest (test async workflow)" })).toBeVisible();

    await expect(page.getByText(/Pick a tenant in the header/i)).not.toBeVisible({ timeout: 20_000 });

    const ingestButton = page.getByRole("button", { name: "Ingest (async)" });
    await expect(ingestButton).toBeEnabled({ timeout: 30_000 });
    await ingestButton.click();

    await expect(page.getByText(/Accepted — tagging runs in the background/i)).toBeVisible({
      timeout: 15_000,
    });

    await expect(page.getByText("completed", { exact: true })).toBeVisible({ timeout: 60_000 });
  });
});
