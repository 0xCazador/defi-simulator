import React from "react";
import { hookstate, State } from "@hookstate/core";
import { HealthFactorData } from "../hooks/useAaveData";
import {
  RiskParamOverrides,
  SharedRiskConfig,
} from "../utils/riskOverrides";

interface HealthFactorStore {
  currentAddress: string;
  currentMarket: string;
  addressData: Record<string, Record<string, HealthFactorData>>;
  /** Manual per-asset risk parameter overrides, keyed by address then market */
  riskOverrides: Record<string, Record<string, RiskParamOverrides>>;
  /** A shared risk config decoded from a `?config=` URL, if any */
  sharedRiskConfig: SharedRiskConfig | null;
  /** Whether the shared config is currently applied to the simulation */
  sharedRiskConfigEnabled: boolean;
}

const defaultState: HealthFactorStore = {
  currentAddress: "",
  currentMarket: "ETHEREUM_V3",
  addressData: {},
  riskOverrides: {},
  sharedRiskConfig: null,
  sharedRiskConfigEnabled: true,
};

export const HealthFactorDataStore: HealthFactorStore = hookstate(defaultState);
