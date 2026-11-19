export const verifyReport = async ({ page, file }) => {
  await page.cdp("egoAutomated.disable");
  await page.cdp("Runtime.enable");
  // The event buffer still holds the app's earlier messages; drain it so they are not blamed on the report.
  await page.events();
  await page.goto(`file://${file}`);
  await page.waitForLoadState();
  const checks = await page.evaluate(() => {
    const images = [...document.querySelectorAll("main img")];
    return {
      images: images.length,
      brokenImages: images.filter((img) => !img.complete || img.naturalWidth === 0).map((img) => img.alt),
      horizontalScroll: document.documentElement.scrollWidth > innerWidth,
    };
  });
  const errors = (await page.events()).flatMap(({ method, params = {} }) => {
    if (method === "Runtime.exceptionThrown") return [params.exceptionDetails?.exception?.description ?? params.exceptionDetails?.text ?? ""];
    if (method === "Runtime.consoleAPICalled" && params.type === "error") return [(params.args ?? []).map((arg) => arg.value ?? arg.description).join(" ")];
    return [];
  });
  return { ...checks, consoleErrors: errors, ok: checks.brokenImages.length === 0 && errors.length === 0 && !checks.horizontalScroll };
};
