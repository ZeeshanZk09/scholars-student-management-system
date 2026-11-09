import { chromium } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";

async function run() {
  const targetUrl = process.argv[2] || "http://localhost:3000";
  const outputDir = process.argv[3] || "public/qa-screenshots";

  fs.mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    targetUrl,
    tests: {},
    metrics: {},
  };

  try {
    // 1. Desktop capture (1920x1080)
    const desktopContext = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    const desktopPage = await desktopContext.newPage();
    const startDesktop = Date.now();
    const resDesktop = await desktopPage.goto(`${targetUrl}/login`, { waitUntil: "domcontentloaded", timeout: 15000 });
    await desktopPage.waitForTimeout(500);
    const desktopLoadTime = Date.now() - startDesktop;

    await desktopPage.screenshot({
      path: path.join(outputDir, "responsive-desktop.png"),
      fullPage: true,
    });
    results.tests["desktop-1920x1080"] = {
      status: resDesktop?.status() === 200 ? "PASS" : "FAIL",
      loadTimeMs: desktopLoadTime,
      url: desktopPage.url(),
    };

    // Form Empty capture
    await desktopPage.screenshot({
      path: path.join(outputDir, "form-empty.png"),
    });

    // Form interaction: fill form
    await desktopPage.fill('input[type="email"], input[name="email"]', "test@example.com").catch(() => {});
    await desktopPage.fill('input[type="password"], input[name="password"]', "Password123!").catch(() => {});
    await desktopPage.screenshot({
      path: path.join(outputDir, "form-filled.png"),
    });

    // Form interaction: submit
    await desktopPage.click('button[type="submit"]').catch(() => {});
    await desktopPage.waitForTimeout(1000);
    await desktopPage.screenshot({
      path: path.join(outputDir, "form-submitted.png"),
    });

    await desktopContext.close();

    // 2. Tablet capture (768x1024)
    const tabletContext = await browser.newContext({
      viewport: { width: 768, height: 1024 },
    });
    const tabletPage = await tabletContext.newPage();
    const startTablet = Date.now();
    const resTablet = await tabletPage.goto(`${targetUrl}/login`, { waitUntil: "domcontentloaded", timeout: 15000 });
    await tabletPage.waitForTimeout(500);
    const tabletLoadTime = Date.now() - startTablet;

    await tabletPage.screenshot({
      path: path.join(outputDir, "responsive-tablet.png"),
      fullPage: true,
    });
    results.tests["tablet-768x1024"] = {
      status: resTablet?.status() === 200 ? "PASS" : "FAIL",
      loadTimeMs: tabletLoadTime,
      url: tabletPage.url(),
    };
    await tabletContext.close();

    // 3. Mobile capture (375x667)
    const mobileContext = await browser.newContext({
      viewport: { width: 375, height: 667 },
      isMobile: true,
      hasTouch: true,
    });
    const mobilePage = await mobileContext.newPage();
    const startMobile = Date.now();
    const resMobile = await mobilePage.goto(`${targetUrl}/login`, { waitUntil: "domcontentloaded", timeout: 15000 });
    await mobilePage.waitForTimeout(500);
    const mobileLoadTime = Date.now() - startMobile;

    await mobilePage.screenshot({
      path: path.join(outputDir, "responsive-mobile.png"),
      fullPage: true,
    });
    results.tests["mobile-375x667"] = {
      status: resMobile?.status() === 200 ? "PASS" : "FAIL",
      loadTimeMs: mobileLoadTime,
      url: mobilePage.url(),
    };
    await mobileContext.close();

    // 4. Navigation Flow
    const navContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const navPage = await navContext.newPage();
    await navPage.goto(`${targetUrl}/login`, { waitUntil: "domcontentloaded" });
    await navPage.screenshot({ path: path.join(outputDir, "nav-before-click.png") });

    // Check forgot-password link
    const forgotLink = navPage.locator('a[href*="forgot-password"]');
    if ((await forgotLink.count()) > 0) {
      await forgotLink.first().click();
      await navPage.waitForTimeout(500);
      await navPage.screenshot({ path: path.join(outputDir, "nav-after-click.png") });
      results.tests["navigation-journey"] = { status: "PASS", dest: navPage.url() };
    } else {
      await navPage.screenshot({ path: path.join(outputDir, "nav-after-click.png") });
      results.tests["navigation-journey"] = { status: "NO_LINK_FOUND" };
    }
    await navContext.close();

    results.metrics = {
      desktopLoadTimeMs: desktopLoadTime,
      tabletLoadTimeMs: tabletLoadTime,
      mobileLoadTimeMs: mobileLoadTime,
      allUnder3s: desktopLoadTime < 3000 && tabletLoadTime < 3000 && mobileLoadTime < 3000,
    };

    fs.writeFileSync(
      path.join(outputDir, "test-results.json"),
      JSON.stringify(results, null, 2),
      "utf-8"
    );
    console.log("Screenshots captured successfully. test-results.json written.");
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
