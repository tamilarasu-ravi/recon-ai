import { expect, test } from "@playwright/test";

test.describe("Smoke", () => {
  test("home hub loads", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Financial operations platform" })).toBeVisible();
  });

  test("review queue page loads", async ({ page }) => {
    await page.goto("/review-queue");
    await expect(page.getByRole("heading", { name: "Review queue" })).toBeVisible();
  });

  test("health API returns ok", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.ok()).toBeTruthy();
    const body = (await response.json()) as { status: string };
    expect(body.status).toBe("ok");
  });
});
