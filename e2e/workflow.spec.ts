/**
 * The workflow the brief asks to demonstrate, in a real browser against a real database:
 * failure cases → preview → import → edit → reload (persistence) → duplicate → edit copy →
 * original unchanged (independence) → import report. Everything it creates is deleted afterwards.
 */
import { expect, test, type Page } from "@playwright/test";
import { buildXlsx, SPECTORA_HEADERS } from "../src/lib/import/__tests__/workbook";

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const RUN = Date.now().toString(36);
const ORIGINAL = `E2E ${RUN}`;
const COPY = `E2E ${RUN} copy`;
const EXPORT = Buffer.from(
  buildXlsx([
    SPECTORA_HEADERS,
    ["Roof", "Coverings", "Asphalt", "<p>Covering is <b>asphalt</b>.</p>", "info", "", 1],
    ["", "", "Missing shingles", '<span style="color:red">Safety:</span> missing<img src="https://example.com/x.jpg">', "defect", 1, 2],
    ["Exterior", "Siding", "Vinyl", "Vinyl siding\nsecond line", "limit", -1, 1],
  ]),
);

test.describe.configure({ mode: "serial" });

let page: Page;
const created: string[] = [];
const card = (title: string) => page.locator("article").filter({ has: page.getByRole("heading", { name: title, exact: true }) });

async function editCommentHtml(title: string, html: string) {
  const commentId = await card(title).getAttribute("id");
  if (!commentId) throw new Error(`Comment ${title} has no stable id.`);
  const target = page.locator(`article[id="${commentId}"]`);
  await target.getByRole("button", { name: "Edit" }).click();
  await target.getByRole("tab", { name: "HTML" }).click();
  await target.getByRole("textbox", { name: "Comment HTML" }).fill(html);
  await target.getByRole("button", { name: "Save" }).click();
  await expect(target.getByRole("button", { name: "Edit" })).toBeVisible();
}

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL!);
  await page.getByLabel("Password").fill(PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
});

test.afterAll(async () => {
  for (const url of [...created].reverse()) {
    await page.goto(url);
    const remove = page.getByRole("button", { name: "Delete", exact: true });
    if (await remove.isVisible()) {
      await remove.click();
      await page.getByRole("button", { name: "Delete permanently" }).click();
      await page.waitForURL("**/templates");
    }
  }
  await page.close();
});

test("rejects files that aren't a Spectora HTML-text export, and imports nothing", async () => {
  await page.goto("/import");
  await page.locator('input[type="file"]').setInputFiles({ name: "template.txt", mimeType: "text/plain", buffer: Buffer.from("Roof\nShingles") });
  await expect(page.getByText("That's the plain-text export")).toBeVisible();
  await expect(page.getByText("Nothing was imported.")).toBeVisible();

  await page.goto("/import");
  await page.locator('input[type="file"]').setInputFiles({
    name: "prices.xlsx",
    mimeType: XLSX_MIME,
    buffer: Buffer.from(buildXlsx([["Name", "Price"], ["Widget", 3]])),
  });
  await expect(page.getByText("This doesn't look like a Spectora template export")).toBeVisible();
});

test("previews, then imports with every cell accounted for", async () => {
  await page.goto("/import");
  await page.locator('input[type="file"]').setInputFiles({ name: "InterNACHI e2e.xlsx", mimeType: XLSX_MIME, buffer: EXPORT });

  await expect(page.getByText("Preview — nothing saved yet")).toBeVisible();
  await expect(page.getByText(/filled cells are accounted for/)).toBeVisible();
  await expect(page.getByText(/removed image \(https:\/\/example\.com\/x\.jpg\)/)).toBeVisible();

  await page.getByLabel("Template name").fill(ORIGINAL);
  await page.getByRole("button", { name: "Import template" }).click();
  await page.waitForURL(/\/templates\/[0-9a-f-]{36}\?imported=1$/);
  created.push(page.url().split("?")[0]);

  await expect(page.getByText("Template imported")).toBeVisible();
  await expect(page.getByRole("button", { name: `Template name: ${ORIGINAL}. Click to rename` })).toBeVisible();
  await expect(card("Missing shingles").locator(".rich span")).toHaveCSS("color", "rgb(255, 0, 0)");
});

test("saves section renames and comment edits across a reload", async () => {
  await page.getByRole("button", { name: "Section name: Roof. Click to rename" }).click();
  const field = page.getByRole("textbox", { name: "Section name" });
  await field.fill("Roof (checked)");
  await field.press("Enter");
  await expect(page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Roof (checked)" })).toBeVisible();

  // A section rename revalidates this server-rendered page. Finish that
  // navigation and prove the rename persisted before opening another editor.
  await page.reload();
  await expect(page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Roof (checked)" })).toBeVisible();

  await editCommentHtml("Asphalt", "<p>Edited by e2e</p>");
  await expect(card("Asphalt").getByText("Edited by e2e")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Roof (checked)" })).toBeVisible();
  await expect(card("Asphalt").getByText("Edited by e2e")).toBeVisible();
});

test("a duplicate can be edited without changing the original", async () => {
  const originalUrl = created[0];
  await page.getByRole("button", { name: "Duplicate" }).click();
  await page.getByLabel("Name of the copy").fill(COPY);
  await page.getByRole("button", { name: "Create copy" }).click();
  await page.waitForURL(/copied=1/);
  created.push(page.url().split("?")[0]);
  await expect(page.getByText("This is an independent copy")).toBeVisible();
  await expect(card("Asphalt").getByText("Edited by e2e")).toBeVisible();

  await editCommentHtml("Asphalt", "<p>Changed only in the copy</p>");
  await expect(card("Asphalt").getByText("Changed only in the copy")).toBeVisible();

  await page.goto(originalUrl);
  await expect(card("Asphalt").getByText("Edited by e2e")).toBeVisible();
  await expect(page.getByText("Changed only in the copy")).toHaveCount(0);
});

test("the import report explains what happened and links back to the editor", async () => {
  await page.goto(`${created[0]}/report`);
  await expect(page.getByRole("heading", { name: "Import report" })).toBeVisible();
  await expect(page.getByText(/filled cells are accounted for/)).toBeVisible();
  await page.getByRole("button", { name: /^Review \(/ }).click();
  await page.getByRole("link", { name: "Open in editor" }).first().click();
  await expect(page).toHaveURL(/section=[0-9a-f-]{36}#item-[0-9a-f-]{36}/);
});
