import {
  Alert,
  Button,
  Center,
  Container,
  Paper,
  SimpleGrid,
  Space,
  Text,
} from "@mantine/core";
import { FiAlertTriangle } from "react-icons/fi";
import { useEffect, useState } from "react";
import { NextRouter, useRouter } from "next/router";
import { ethers } from "ethers";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";

import { useAaveData } from "../hooks/useAaveData";
import AppBar from "../components/AppBar";
import AddressInput, { isValidENSAddress } from "../components/AddressInput";
import AddressCard from "../components/AddressCard";
import Footer from "../components/Footer";
import { RandomAddressButton } from "../components/RandomAddressButton";
import { activateLocale } from "../utils/i18n";

export default function HomePage() {
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
      <AddressInput />
      {currentAddress && <AddressCard />}
      {!currentAddress && <SplashSection />}
      <ExperimentalAlert />
      <Footer />
    </Container>
  );
}

const SplashSection = () => {
  const router: NextRouter = useRouter();
  return (
    <>
      <Center mt={30}>
        <Text fz="lg" ta="center" maw={620} span>
          <Trans>
            Paste an address with an Aave debt position in the box above to
            visualize how changes to borrow/supplied assets affect the
            position&apos;s health factor and borrowing power.
          </Trans>
        </Text>
      </Center>

      <Space h="xl" />

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg" maw={680} mx="auto">
        <Paper
          withBorder
          p="xl"
          ta="center"
          style={{ display: "flex", flexDirection: "column", gap: "16px" }}
        >
          <Text fz="md" style={{ flexGrow: 1 }}>
            <Trans>Want to go for a quick spin?</Trans>
          </Text>
          <Center>
            <RandomAddressButton />
          </Center>
        </Paper>

        <Paper
          withBorder
          p="xl"
          ta="center"
          style={{ display: "flex", flexDirection: "column", gap: "16px" }}
        >
          <Text fz="md" style={{ flexGrow: 1 }}>
            <Trans>Create a new simulated position in any Aave market:</Trans>
          </Text>
          <Center>
            <Button
              variant="gradient"
              onClick={() => router.push("?address=sandbox.eth")}
            >
              <Trans>Build from Scratch</Trans>
            </Button>
          </Center>
        </Paper>
      </SimpleGrid>
    </>
  );
};

const ExperimentalAlert = () => {
  const [shouldDisplay, setShouldDisplay] = useState(true);

  if (!shouldDisplay) return null;

  return (
    <Alert
      mb={15}
      mt={45}
      icon={<FiAlertTriangle size="1rem" />}
      title={<Trans>Experimental!</Trans>}
      color="red"
      withCloseButton
      onClose={() => setShouldDisplay(false)}
      variant="outline"
      closeButtonLabel={t`Close alert`}
    >
      <Trans>
        This Aave debt simulator and liquidation calculator is experimental.
        Don&apos;t make financial decisions based solely on the results of this
        app.
      </Trans>
    </Alert>
  );
};
