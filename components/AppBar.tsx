import Link from "next/link";

import { Box, Container, Group, UnstyledButton, Title } from "@mantine/core";
import { BiGhost } from "react-icons/bi";

import MarketPicker from "./MarketPicker";
import classes from "./AppBar.module.css";

export default function AppBar() {
  return (
    <Box component="header" className={classes.header} mb={16}>
      <Container className={classes.inner}>
        {/* A real link (not a click handler) so the home control is
            keyboard-focusable and announced as navigation. */}
        <UnstyledButton component={Link} href="/" className={classes.brand}>
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
