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
            {/* A span, not a heading: the brand repeats on every page, so
                letting it own an <h3> put a heading above each page's <h1>
                and inverted the document outline. `order` still drives the
                type scale. */}
            <Title order={3} component="span" className={classes.brandTitle}>
              DeFi Simulator
            </Title>
          </Group>
        </UnstyledButton>

        <MarketPicker />
      </Container>
    </Box>
  );
}
