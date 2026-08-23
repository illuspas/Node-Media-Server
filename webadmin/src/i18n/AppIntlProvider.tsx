import { useEffect, useSyncExternalStore } from "react";
import { IntlProvider } from "react-intl";
import { DEFAULT_LOCALE, localeStore, messages } from "./index";

interface AppIntlProviderProps {
  children: React.ReactNode;
}

/** Root react-intl provider; re-renders the subtree on locale changes. */
export default function AppIntlProvider({ children }: AppIntlProviderProps) {
  const locale = useSyncExternalStore(localeStore.subscribe, localeStore.get, localeStore.get);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <IntlProvider locale={locale} defaultLocale={DEFAULT_LOCALE} messages={messages[locale]}>
      {children}
    </IntlProvider>
  );
}
