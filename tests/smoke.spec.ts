// Behavior smoke test for the QR code generator: checks B1–B9.
// B8 (no page errors, and no 4xx/5xx responses or console errors from this site's origin) runs after
// every test. Other origins don't count, so e.g. the Vercel toolbar on a preview can't trip it.
// B4 and B9 are pre-existing bugs, marked test.fail(): the suite stays green while they fail and
// goes red once one passes, which is the cue to drop its test.fail().
import { test as base, expect, type Locator, type Page } from "@playwright/test";
import jsQR from "jsqr";
import { PNG } from "pngjs";

const TEXT = "https://example.com/upgrade-check?x=1";

const test = base.extend<{ siteErrors: string[] }>({
  siteErrors: [
    async ({ page, baseURL }, runTest) => {
      const origin = new URL(baseURL!).origin;
      const isOwnOrigin = (url: string) => URL.canParse(url) && new URL(url).origin === origin;
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(`page error: ${error.message}`));
      page.on("response", (response) => {
        if (response.status() >= 400 && isOwnOrigin(response.url())) {
          errors.push(`${response.status()} ${response.url()}`);
        }
      });
      page.on("console", (message) => {
        const url = message.location().url;
        // A console error with no source location is counted as the site's own.
        if (message.type() === "error" && (!url || isOwnOrigin(url))) {
          errors.push(`console error: ${message.text()}`);
        }
      });
      await runTest(errors);
      expect(errors, "B8: no page errors, own-origin 4xx/5xx responses or own-origin console errors").toEqual([]);
    },
    { auto: true },
  ],
});

const input = (page: Page) => page.getByLabel("QR Code Data");
const qrImage = (page: Page) => page.locator('img[alt="qr code image"]');

// The text the QR code on screen decodes to, or null while there is none to read.
async function decodeQr(image: Locator): Promise<string | null> {
  try {
    const png = PNG.sync.read(await image.screenshot({ timeout: 1000 }));
    return jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data ?? null;
  } catch {
    return null; // not on screen yet, or re-rendered mid-read
  }
}

// The app keeps its value in the URL as ?qrCodeData=<encodeURI(JSON.stringify(value))>.
function urlValue(page: Page): unknown {
  const raw = new URL(page.url()).searchParams.get("qrCodeData");
  try {
    return raw === null ? undefined : JSON.parse(decodeURI(raw));
  } catch {
    return undefined;
  }
}

// The app rewrites the URL with router.replace after loading and on every change; wait until it stops.
async function waitForUrlToSettle(page: Page, quietMs = 500) {
  for (let last = ""; last !== page.url(); ) {
    last = page.url();
    await page.waitForTimeout(quietMs);
  }
}

// Load a page and wait until the app has hydrated, which it shows by writing its value into the URL.
async function open(page: Page, path = "/") {
  await page.goto(path);
  await expect(page).toHaveURL(/[?&]qrCodeData=/);
  await waitForUrlToSettle(page);
}

test("B1 renders the title and an empty input, with no QR code yet", async ({ page }) => {
  await open(page);
  await expect(page).toHaveTitle("QR Code Generator");
  await expect(input(page)).toBeVisible();
  await expect(input(page)).toHaveValue("");
  await expect(qrImage(page)).toBeHidden();
});

test("B2 typed text becomes a 320x320 QR code that decodes back to it", async ({ page }) => {
  await open(page);
  await input(page).pressSequentially(TEXT, { delay: 15 }); // one key at a time, like a user
  await expect.poll(() => decodeQr(qrImage(page)), { timeout: 10_000 }).toBe(TEXT);
  const box = await qrImage(page).boundingBox();
  expect(box && [Math.round(box.width), Math.round(box.height)]).toEqual([320, 320]);
});

test("B3 a deep link pre-fills the input and the QR code, and the URL keeps it", async ({ page }) => {
  const value = "deep-link-test";
  await open(page, `/?${new URLSearchParams({ qrCodeData: encodeURI(JSON.stringify(value)) })}`);
  await expect(input(page)).toHaveValue(value);
  await expect.poll(() => decodeQr(qrImage(page))).toBe(value);
  await waitForUrlToSettle(page);
  expect(urlValue(page)).toBe(value);
});

// Pre-existing bug: hooks/useLocalUrlState.ts saves the empty default to localStorage before it
// reads the stored value, so every load overwrites the last value instead of restoring it.
test.fail("B4 reloading restores the last value from localStorage", async ({ page }) => {
  await open(page);
  await input(page).fill(TEXT);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("qrCodeData"))).toBe(JSON.stringify(TEXT));
  await open(page);
  await expect(input(page)).toHaveValue(TEXT);
  await expect.poll(() => decodeQr(qrImage(page))).toBe(TEXT);
});

test("B5 typing updates the URL query", async ({ page }) => {
  await open(page);
  await input(page).pressSequentially(TEXT, { delay: 15 });
  await expect.poll(() => urlValue(page)).toBe(TEXT);
});

test("B6 overlong input shows the error, and valid input clears it", async ({ page }) => {
  await open(page);
  await input(page).fill("x".repeat(5000));
  // Mantine's Alert has role=alert, and so does Next's route announcer, hence the filter.
  const alert = page.getByRole("alert").filter({ hasText: "Error!" });
  await expect(alert).toContainText("The amount of data is too big to be stored in a QR Code");
  await input(page).fill("after-error");
  await expect(alert).toBeHidden();
  await expect.poll(() => decodeQr(qrImage(page))).toBe("after-error");
});

test("B7 the server-rendered HTML already has the styles and the input", async ({ request }) => {
  const response = await request.get("/");
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toMatch(/data-emotion|<style[^>]*mantine/);
  expect(html).toContain("QR Code Data");
});

// Pre-existing bug: pages/index.tsx skips QR generation for "" and never clears the previous image,
// so the old QR code stays on screen.
test.fail("B9 clearing the input removes the QR code", async ({ page }) => {
  await open(page);
  await input(page).fill("clear-me");
  await expect.poll(() => decodeQr(qrImage(page))).toBe("clear-me");
  await input(page).fill("");
  await waitForUrlToSettle(page);
  await expect(qrImage(page)).toBeHidden();
});
