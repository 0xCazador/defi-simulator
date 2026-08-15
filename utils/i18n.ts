import { i18n } from "@lingui/core";
import { messages } from "../src/locales/en/messages";

const defaultLocale = "en";

i18n.load(defaultLocale, messages);
i18n.activate(defaultLocale);

/** Load and activate a compiled Lingui catalog for `locale`. */
export async function activateLocale(locale: string) {
  const { messages: localeMessages } = await import(
    `../src/locales/${locale}/messages`
  );
  i18n.load(locale, localeMessages);
  i18n.activate(locale);
}
