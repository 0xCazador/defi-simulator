import * as React from 'react';

import { useRouter } from 'next/router';

import { formatNumber } from 'accounting';

import { FaChevronDown, FaInfinity } from 'react-icons/fa';

import { Trans } from "@lingui/macro";

import {
  Container,
  Group,
  Header,
  Menu,
  UnstyledButton,
  createStyles,
  Text,
  Badge,
  Title,
  Center,
  Indicator,
} from '@mantine/core';
import { BiGhost } from 'react-icons/bi';
import { getHealthFactorColor, markets, useAaveData } from '../hooks/useAaveData';
import { AbbreviatedEthereumAddress } from './AddressCard';
import { BsCheckLg } from 'react-icons/bs';

const useStyles = createStyles((theme) => ({
  inner: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 56,
    paddingLeft: '0px',
    paddingRight: '0px',
  },
  market: {
    color: theme.colorScheme === 'dark' ? theme.colors.dark[0] : theme.black,
    padding: '0px',
    borderRadius: theme.radius.sm,
    transition: 'background-color 100ms ease',

    '&:hover': {
      backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[8] : theme.white,
    },
  },

  marketActive: {
    backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[8] : theme.white,
  },
}));

export default function AppBar() {
  const [hasMarketMenuOpened, setHasMarketMenuOpened] = React.useState(false);
  const { addressData, currentMarket, setCurrentMarket, currentAddress } = useAaveData('');
  const { classes, cx } = useStyles();
  const router = useRouter();

  const numMarketsWithHF: number = markets.filter(market => {
    const hasHF: boolean = (addressData?.[market.id]?.workingData?.healthFactor || -1) > -1;
    return hasHF;
  }).length;

  const handleSelectMarket = (marketId: string) => {
    setCurrentMarket(marketId);
  };

  const currentMarketData = markets.find((market) => market.id === currentMarket);
  const currentMarketIcon = (
    <img
      src={`/icons/networks/${currentMarketData?.id?.split('_')[0].toLowerCase()}.svg`}
      width="20px"
      height="20px"
      alt={`${currentMarketData?.title}`}
      style={{ marginRight: '4px' }}
    />
  );

  return (
    <Header height={56} mb={16} pl={0} pr={0}>
      <Container className={classes.inner}>
        <Group spacing={7} style={{ cursor: 'pointer' }} onClick={() => router.push('/')}>
          <BiGhost size={32} />
          <Title
            order={3}
            variant="gradient"
            gradient={{ from: '#339af0', to: '#339af0', deg: 90 }}
          >
            DeFi Simulator
          </Title>
        </Group>

        <Indicator inline label={`${numMarketsWithHF}`} size={12} disabled={numMarketsWithHF < 2}>
          <Menu width={260} position="bottom-end" onClose={() => { }} onOpen={() => { }}>
            <Menu.Target>
              <UnstyledButton
                className={cx(classes.market, { [classes.marketActive]: hasMarketMenuOpened })}
              >
                <Group spacing={7}>
                  <Text weight={500} size="sm" sx={{ lineHeight: 1 }} mr={2}>
                    {currentMarketIcon}
                    {currentMarketData?.title}
                  </Text>
                  <FaChevronDown size={10} />
                </Group>
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>
                {currentAddress ? (
                  <Text span>
                    <Trans>Markets for</Trans>{' '}
                    <Text fw={700} span>
                      <AbbreviatedEthereumAddress address={currentAddress} />
                    </Text>{' '}
                  </Text>
                ) : (
                  <Text><Trans>No address found</Trans></Text>
                )}
              </Menu.Label>

              <Menu.Divider />

              <Menu.Label><Trans>Aave Markets</Trans></Menu.Label>

              {markets.map((market) => {
                // aave utils returns -1 hf when there is no position
                const hf: number = addressData?.[market.id]?.workingData?.healthFactor ?? -1;
                const hasHF: boolean = hf > -1;
                const isCurrentMarket: boolean = currentMarket === market.id;
                const hfColor: string = getHealthFactorColor(hf);

                const icon = (
                  <img
                    src={`/icons/networks/${market.id.split('_')[0].toLowerCase()}.svg`}
                    width="25px"
                    height="25px"
                    alt={`${market.title}`}
                  />
                );

                return (
                  <Menu.Item
                    key={market.id}
                    id={market.id}
                    icon={icon}
                    onClick={() => handleSelectMarket(market.id)}
                  >
                    {market.title}
                    {hasHF ? (
                      <Badge color={hfColor} radius="sm" variant="filled" ml={10}>
                        {hf === Infinity ? (
                          <Center inline>
                            <FaInfinity size={14} style={{ paddingTop: '4px' }} />
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
                    {isCurrentMarket && <Center inline><BsCheckLg style={{ marginLeft: "5px", marginTop: "10px" }} /></Center>}
                  </Menu.Item>
                );
              })}
            </Menu.Dropdown>
          </Menu>
        </Indicator>

      </Container>
    </Header>
  );
}
