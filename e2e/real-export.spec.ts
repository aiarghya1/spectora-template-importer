/** The committed Spectora export through the full public-app workflow. */
import { expect, test, type Page } from "@playwright/test";
import { resolve } from "node:path";

const FIXTURE = resolve(process.cwd(), "fixtures/InterNACHI Residential.xlsx");
const NAME = `Real export E2E ${Date.now().toString(36)}`;

async function editComment(page: Page, title: string, html: string) {
  const article = page.locator("article").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  const id = await article.getAttribute("id");
  if (!id) throw new Error(`Comment ${title} has no stable id.`);
  const target = page.locator(`article[id="${id}"]`);
  await target.getByRole("button", { name: "Edit" }).click();
  await target.getByRole("tab", { name: "HTML" }).click();
  await target.getByRole("textbox", { name: "Comment HTML" }).fill(html);
  await target.getByRole("button", { name: "Save" }).click();
  await expect(target.getByRole("button", { name: "Edit" })).toBeVisible();
}

test("imports the real export, persists edits, and keeps an edited copy independent", async ({ browser }) => {
  test.setTimeout(180_000);
  const page = await browser.newPage();
  const created: string[] = [];
  try {
    await page.goto("/login");
    await page.getByLabel("Email").fill(process.env.E2E_EMAIL!);
    await page.getByLabel("Password").fill(process.env.E2E_PASSWORD!);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));

    await page.goto("/import");
    await page.locator('input[type="file"]').setInputFiles(FIXTURE);
    await expect(page.getByText("Preview — nothing saved yet")).toBeVisible();
    await expect(page.getByText(/filled cells are accounted for/)).toBeVisible();
    await page.getByLabel("Template name").fill(NAME);
    await page.getByRole("button", { name: "Import template" }).click();
    await page.waitForURL(/\/templates\/[0-9a-f-]{36}\?imported=1$/);
    created.push(page.url().split("?")[0]);
    await expect(page.getByRole("navigation", { name: "Sections" }).getByRole("link")).toHaveCount(13);

    await page.getByRole("button", { name: "Section name: Inspection Details. Click to rename" }).click();
    const sectionName = page.getByRole("textbox", { name: "Section name" });
    await sectionName.fill("Inspection Details (checked)");
    await sectionName.press("Enter");
    await expect(page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Inspection Details (checked)" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Inspection Details (checked)" })).toBeVisible();

    await editComment(page, "In Attendance", "<p>Edited real export</p>");
    await page.reload();
    await expect(page.getByText("Edited real export")).toBeVisible();

    await page.getByRole("button", { name: "Duplicate" }).click();
    await page.getByLabel("Name of the copy").fill(`${NAME} copy`);
    await page.getByRole("button", { name: "Create copy" }).click();
    await page.waitForURL(/copied=1/);
    created.push(page.url().split("?")[0]);
    await editComment(page, "In Attendance", "<p>Changed only in real-export copy</p>");
    await page.goto(created[0]);
    await expect(page.getByText("Edited real export")).toBeVisible();
    await expect(page.getByText("Changed only in real-export copy")).toHaveCount(0);

    await page.goto(`${created[0]}/report`);
    await expect(page.getByRole("heading", { name: "Import report" })).toBeVisible();
    await expect(page.getByText(/filled cells are accounted for/)).toBeVisible();
  } finally {
    for (const url of created.reverse()) {
      await page.goto(url);
      await page.getByRole("button", { name: "Delete", exact: true }).click();
      await page.getByRole("button", { name: "Delete permanently" }).click();
      await page.waitForURL("**/templates");
    }
    await page.close();
  }
});
