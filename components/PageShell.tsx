import { ReactNode, useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import {
  Alert,
  Button,
  Center,
  Container,
  Paper,
  SimpleGrid,
  Space,
  Text,
  Title,
} from "@mantine/core";
import { FiAlertTriangle } from "react-icons/fi";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";

import { useAddressFromQuery } from "../hooks/useAddressFromQuery";
import { useAaveData } from "../hooks/useAaveData";
import AppBar from "./AppBar";
import AddressInput from "./AddressInput";
import AddressCard from "./AddressCard";
import InterestManifest from "./InterestManifest";
import Footer from "./Footer";
import ViewTabs from "./ViewTabs";
import SeoHead from "./SeoHead";
import { RandomAddressButton } from "./RandomAddressButton";
import type { SeoContent } from "../utils/seoContent";

type PageShellProps = {
  /** Copy resolved for the request's locale in getStaticProps. Absent on the
   * share routes, which supply their own meta. */
  seo?: SeoContent;
  children?: ReactNode;
};

export default function PageShell({ seo, children }: PageShellProps) {
  useAddressFromQuery();
  const router = useRouter();
  const { currentAddress } = useAaveData("");
  const isInterest = router.pathname === "/interest";
  const [interestVisited, setInterestVisited] = useState(isInterest);

  useEffect(() => {
    if (isInterest) setInterestVisited(true);
  }, [isInterest]);

  // Share routes render their own chrome (snapshot-seeded views + status
  // banner), so the shell stays out of the way there.
  if (
    router.pathname.startsWith("/s/") ||
    router.pathname === "/share-fallback"
  )
    return <>{children}</>;

  return (
    <>
      {seo ? (
        <SeoHead route={isInterest ? "/interest" : "/"} content={seo} />
      ) : (
        <Head>
          <title>
            {isInterest
              ? t`Interest Accrual · DeFi Simulator`
              : t`DeFi Simulator`}
          </title>
        </Head>
      )}
      <Container px="xs" style={{ contain: "paint" }}>
        <AppBar />
        {/* The page's one <h1>. Kept above the address input so the document
            outline opens with the heading that describes the tool, and driven
            by the locale-resolved copy rather than a t`` macro, which would
            render English into every prerendered locale. */}
        {seo && (
          <Title order={1} size="h3" ta="center" mt="md" mb="xs">
            {seo.h1}
          </Title>
        )}
        <AddressInput />
        <ViewTabs />
        <div hidden={isInterest} inert={isInterest || undefined}>
          {currentAddress ? <AddressCard /> : <SplashSection />}
          <ExperimentalAlert />
        </div>
        {interestVisited && (
          <div hidden={!isInterest} inert={!isInterest || undefined}>
            {currentAddress ? <InterestManifest /> : <InterestEmptyState />}
          </div>
        )}
        {children}
        <Footer />
      </Container>
    </>
  );
}

const SplashSection = () => {
  const router = useRouter();
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

const InterestEmptyState = () => (
  <Center mt={30}>
    <Text fz="lg" ta="center" maw={620}>
      <Trans>
        Paste an address with an Aave position in the box above to view a
        detailed accounting of how and when it accrued interest.
      </Trans>
    </Text>
  </Center>
);
