import { hookstate } from "@hookstate/core";
import type { HealthFactorData } from "../hooks/useAaveData";

interface HealthFactorStore {
  currentAddress: string;
  currentMarket: string;
  addressData: Record<string, Record<string, HealthFactorData>>;
  selectedBlockNumber?: number; // undefined means latest block
  isHistoryMode: boolean; // true when viewing historical data
}

export const createDefaultHealthFactorStoreState = (): HealthFactorStore => ({
  currentAddress: "",
  currentMarket: "ETHEREUM_V3",
  addressData: {},
  selectedBlockNumber: undefined, // undefined means latest block
  isHistoryMode: false,
});

export const HealthFactorDataStore: HealthFactorStore = hookstate(
  createDefaultHealthFactorStoreState()
);
