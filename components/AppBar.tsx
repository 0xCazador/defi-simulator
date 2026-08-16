import Link from "next/link";
import { useRouter } from "next/router";

import { Box, Container, Group, UnstyledButton, Title } from "@mantine/core";
import { BiGhost } from "react-icons/bi";

import { useAaveData } from "../hooks/useAaveData";
import MarketPicker from "./MarketPicker";
import { buildViewHref } from "./ViewTabs";
import classes from "./AppBar.module.css";

export default function AppBar() {
  const router = useRouter();
  const { currentAddress } = useAaveData("");
  const query = { ...router.query };
  if (!query.address && currentAddress) {
    query.address = currentAddress;
  }

  return (
    <Box component="header" className={classes.header} mb={16}>
      <Container className={classes.inner}>
        {/* A real link (not a click handler) so the home control is
            keyboard-focusable and announced as navigation. */}
        <UnstyledButton
          component={Link}
          href={buildViewHref("/", query)}
          className={classes.brand}
        >
          <Group gap={7}>
            <BiGhost size={32} />
            <Title order={3} className={classes.brandTitle}>
              DeFi Simulator
            </Title>
          </Group>
        </UnstyledButton>

        <MarketPicker />
      </Container>
    </Box>
  );
}
