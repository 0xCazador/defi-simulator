import { hookstate } from "@hookstate/core";
import { HealthFactorData } from "../hooks/useAaveData";

interface HealthFactorStore {
  currentAddress: string;
  currentMarket: string;
  /** True after the user (or a URL/`?market=` share) picks a market. Auto-select
   * must not override that choice while remaining markets are still loading. */
  userPickedMarket: boolean;
  addressData: Record<string, Record<string, HealthFactorData>>;
}

const defaultState: HealthFactorStore = {
  currentAddress: "",
  currentMarket: "ETHEREUM_V3",
  userPickedMarket: false,
  addressData: {},
};

export const HealthFactorDataStore: HealthFactorStore = hookstate(defaultState);
