import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import type { ParsedUrlQuery } from "querystring";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { AiTwotoneExperiment } from "react-icons/ai";
import { TbAdjustmentsHorizontal } from "react-icons/tb";

import classes from "./ViewTabs.module.css";

export type AppViewPath = "/" | "/interest";

/** Builds a same-session href that keeps the current query (address, etc.). */
export function buildViewHref(
  pathname: AppViewPath,
  query: ParsedUrlQuery,
  extra?: Record<string, string | undefined>,
) {
  const nextQuery: ParsedUrlQuery = { ...query };
  if (extra) {
    Object.entries(extra).forEach(([key, value]) => {
      if (value === undefined) delete nextQuery[key];
      else nextQuery[key] = value;
    });
  }
  return { pathname, query: nextQuery };
}

const tabs: {
  pathname: AppViewPath;
  label: ReactNode;
  icon: ReactNode;
}[] = [
  {
    pathname: "/",
    label: <Trans>Simulator</Trans>,
    icon: <TbAdjustmentsHorizontal size={16} />,
  },
  {
    pathname: "/interest",
    label: <Trans>Interest Accrual</Trans>,
    icon: <AiTwotoneExperiment size={16} />,
  },
];

export default function ViewTabs() {
  const router = useRouter();
  const activeIndex = router.pathname === "/interest" ? 1 : 0;

  return (
    <nav className={classes.nav} aria-label={t`Page views`}>
      <div className={classes.track} data-active-index={activeIndex}>
        {/* Sliding pill behind the active link; purely decorative. */}
        <span className={classes.indicator} aria-hidden="true" />
        {tabs.map((tab) => {
          const isActive = router.pathname === tab.pathname;
          return (
            <Link
              key={tab.pathname}
              href={buildViewHref(tab.pathname, router.query)}
              className={`${classes.link}${isActive ? ` ${classes.active}` : ""}`}
              aria-current={isActive ? "page" : undefined}
            >
              <span className={classes.icon}>{tab.icon}</span>
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
