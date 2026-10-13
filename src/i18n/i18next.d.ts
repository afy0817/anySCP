import "i18next";
import type common from "./locales/en/common.json";
import type app from "./locales/en/app.json";
import type settings from "./locales/en/settings.json";
import type dashboard from "./locales/en/dashboard.json";
import type history from "./locales/en/history.json";
import type terminal from "./locales/en/terminal.json";
import type explorer from "./locales/en/explorer.json";
import type transfers from "./locales/en/transfers.json";
import type s3 from "./locales/en/s3.json";
import type snippets from "./locales/en/snippets.json";
import type tunnels from "./locales/en/tunnels.json";
import type core from "./locales/en/core.json";

// English is the source of truth: t() keys are type-checked against en/*.json.
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    returnNull: false;
    resources: {
      common: typeof common;
      app: typeof app;
      settings: typeof settings;
      dashboard: typeof dashboard;
      history: typeof history;
      terminal: typeof terminal;
      explorer: typeof explorer;
      transfers: typeof transfers;
      s3: typeof s3;
      snippets: typeof snippets;
      tunnels: typeof tunnels;
      core: typeof core;
    };
  }
}
