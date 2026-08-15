import * as React from "react";

import Link from "next/link";

import { formatNumber } from "accounting";

import { FaChevronDown, FaInfinity } from "react-icons/fa";

import { Trans } from "@lingui/react/macro";

import {
  Box,
  Container,
  Group,
  Menu,
  UnstyledButton,
  Text,
  Badge,
  Title,
  Center,
  Indicator,
  Loader,
} from "@mantine/core";
import { BiGhost } from "react-icons/bi";
import { BsCheckLg } from "react-icons/bs";
import {
  getHealthFactorColor,
  getIconNameFromMarket,
  markets,
  useAaveData,
} from "../hooks/useAaveData";
import { AbbreviatedEthereumAddress } from "./position/AbbreviatedEthereumAddress";
import classes from "./AppBar.module.css";

export default function AppBar() {
  const [hasMarketMenuOpened, setHasMarketMenuOpened] = React.useState(false);
  const { addressData, currentMarket, setCurrentMarket, currentAddress } =
    useAaveData("");

  const numMarketsWithHF: number = markets.filter((market) => {
    const hasHF: boolean =
      (addressData?.[market.id]?.workingData?.healthFactor || -1) > -1;
    return hasHF;
  }).length;

  const handleSelectMarket = (marketId: string) => {
    setCurrentMarket(marketId);
  };

  const currentMarketData = markets.find(
    (market) => market.id === currentMarket,
  );
  const currentMarketIcon = (
    <img
      src={`/icons/networks/${getIconNameFromMarket(currentMarketData)}.svg`}
      width="20px"
      height="20px"
      alt=""
      // Block, so it centers as a flex item instead of sitting on the
      // adjacent text's baseline.
      style={{ display: "block" }}
    />
  );

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

        <Indicator
          inline
          label={`${numMarketsWithHF}`}
          size={12}
          disabled={numMarketsWithHF < 2}
        >
          <Menu
            width={260}
            position="bottom-end"
            onClose={() => setHasMarketMenuOpened(false)}
            onOpen={() => setHasMarketMenuOpened(true)}
          >
            <Menu.Target>
              <UnstyledButton
                className={`${classes.market}${
                  hasMarketMenuOpened ? ` ${classes.marketActive}` : ""
                }`}
              >
                <Group gap={7} align="center" wrap="nowrap">
                  {currentMarketIcon}
                  <Text fw={500} size="sm" lh={1}>
                    {currentMarketData?.title}
                  </Text>
                  <FaChevronDown size={10} style={{ display: "block" }} />
                </Group>
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>
                {currentAddress ? (
                  <Text span>
                    <Trans>Markets for</Trans>{" "}
                    <Text fw={700} span>
                      <AbbreviatedEthereumAddress address={currentAddress} />
                    </Text>{" "}
                  </Text>
                ) : (
                  <Text>
                    <Trans>No address found</Trans>
                  </Text>
                )}
              </Menu.Label>

              <Menu.Divider />

              <Menu.Label>
                <Trans>Aave Markets</Trans>
              </Menu.Label>

              {markets.map((market) => {
                // aave utils returns -1 hf when there is no position
                const hf: number =
                  addressData?.[market.id]?.workingData?.healthFactor ?? -1;
                const hasHF: boolean = hf > -1;
                const isCurrentMarket: boolean = currentMarket === market.id;
                const hfColor: string = getHealthFactorColor(hf);
                const isMarketFetching: boolean =
                  !!addressData?.[market.id]?.isFetching;
                const hasMarketError: boolean =
                  !!addressData?.[market.id]?.fetchError?.length;

                const icon = (
                  <img
                    src={`/icons/networks/${getIconNameFromMarket(market)}.svg`}
                    width="25px"
                    height="25px"
                    alt={`${market.title}`}
                  />
                );

                return (
                  <Menu.Item
                    key={market.id}
                    id={market.id}
                    leftSection={icon}
                    onClick={() => handleSelectMarket(market.id)}
                  >
                    {market.title}
                    {isMarketFetching ? (
                      <Badge color="gray" radius="sm" variant="filled" ml={10}>
                        <Loader type="dots" size="xs" color="gray" />
                      </Badge>
                    ) : hasMarketError ? (
                      <Badge color="red" radius="sm" variant="outline" ml={10}>
                        !
                      </Badge>
                    ) : hasHF ? (
                      <Badge
                        color={hfColor}
                        radius="sm"
                        variant="filled"
                        ml={10}
                      >
                        {hf === Infinity ? (
                          <Center inline>
                            <FaInfinity
                              size={14}
                              style={{ paddingTop: "4px" }}
                            />
                          </Center>
                        ) : (
                          <span>{formatNumber(hf, 2)}</span>
                        )}
                      </Badge>
                    ) : (
                      <Badge color="gray" radius="sm" variant="filled" ml={10}>
                        ---
                      </Badge>
                    )}
                    {isCurrentMarket && (
                      <Center inline>
                        <BsCheckLg
                          style={{ marginLeft: "5px", marginTop: "10px" }}
                        />
                      </Center>
                    )}
                  </Menu.Item>
                );
              })}
            </Menu.Dropdown>
          </Menu>
        </Indicator>
      </Container>
    </Box>
  );
}
