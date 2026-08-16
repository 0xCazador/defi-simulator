import { useEffect } from "react";
import { useRouter } from "next/router";
import { ethers } from "ethers";

import { useAaveData } from "./useAaveData";
import { isValidENSAddress } from "../components/AddressInput";
import { activateLocale } from "../utils/i18n";

/**
 * Keeps the in-memory address and active locale in sync with the URL.
 * Shared by both views so tab switches do not duplicate this effect.
 */
export function useAddressFromQuery() {
  const router = useRouter();
  const address = router?.query?.address as string;
  const isValidAddress: boolean =
    ethers.utils.isAddress(address) || isValidENSAddress(address);
  const { currentAddress, setCurrentAddress } = useAaveData(
    isValidAddress ? address : "",
  );

  const locale = router?.locale;

  useEffect(() => {
    // ensure current address is correctly set from url
    if (!address && currentAddress) {
      setCurrentAddress("");
    }
    if (router.query.address && router.query.address !== currentAddress) {
      if (isValidAddress) {
        setCurrentAddress(address);
      }
    }
    // Sync only when the URL address changes, matching the previous page-level effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  useEffect(() => {
    // ensure current locale is correctly set from url
    if (locale) activateLocale(locale);
  }, [locale]);
}
