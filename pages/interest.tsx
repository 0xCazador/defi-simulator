import { useEffect } from "react";
import { Button, Center, Container, Space, Text } from "@mantine/core";
import { NextRouter, useRouter } from "next/router";
import { ethers } from "ethers";
import { Trans } from "@lingui/react/macro";

import { useAaveData } from "../hooks/useAaveData";
import AppBar from "../components/AppBar";
import { isValidENSAddress } from "../components/AddressInput";
import InterestManifest from "../components/InterestManifest";
import Footer from "../components/Footer";
import { activateLocale } from "../utils/i18n";

export default function InterestPage() {
  const router: NextRouter = useRouter();
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
  }, [address]);

  useEffect(() => {
    // ensure current locale is correctly set from url
    if (locale) activateLocale(locale);
  }, [locale]);

  return (
    <Container px="xs" style={{ contain: "paint" }}>
      <AppBar />
      {currentAddress ? <InterestManifest /> : <NoAddressSection />}
      <Footer />
    </Container>
  );
}

const NoAddressSection = () => {
  const router: NextRouter = useRouter();
  return (
    <>
      <Center mt={30}>
        <Text fz="md" ta="center">
          <Trans>
            Provide an address to view a detailed accounting of how and when its
            Aave positions accrued interest.
          </Trans>
        </Text>
      </Center>
      <Space h="md" />
      <Center>
        <Button onClick={() => router.push("/")}>
          <Trans>Go to Simulator</Trans>
        </Button>
      </Center>
    </>
  );
};
