import {
  Alert,
  Button,
  Center,
  Container,
  List,
  Mark,
  Space,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { FiAlertTriangle } from 'react-icons/fi';
import { useEffect, useState, Children, cloneElement, ReactChild, ReactElement } from 'react';
import { useRouter } from 'next/router';
import { ethers } from 'ethers';
import { useAaveData } from '../hooks/useAaveData';
import AppBar from '../components/AppBar';
import AddressInput, { isValidENSAddress } from '../components/AddressInput';
import AddressCard, { HealthFactorSkeleton } from '../components/AddressCard';
import Footer from '../components/Footer';

export default function HomePage() {
  const router = useRouter();
  const address = router?.query?.address as string;
  const { currentAddress, setCurrentAddress } = useAaveData(address);

  useEffect(() => {
    if (!router.query.address && currentAddress) {
      setCurrentAddress('');
    }
    if (router.query.address && router.query.address !== currentAddress) {
      if (
        ethers.utils.isAddress(String(router.query.address)) ||
        isValidENSAddress(String(router.query.address))
      ) {
        setCurrentAddress(String(router.query.address));
      }
    }
  }, [router.query]);

  return (
    <Container>
      <AppBar />
      <AddressInput />
      {currentAddress && <ExperimentalAlert />}
      {currentAddress && <AddressCard />}
      {!currentAddress && <SplashSection />}
      <Footer />
    </Container>
  );
}

const SplashSection = () => (
  <>
    <Center mt={15}>
      <Text fz="md" span>
        Paste an Aave CDP address in the box above to visualize how changes to borrow/reserve assets
        affect an Aave CDP's health factor and borrowing power.
      </Text>
    </Center>

    <Center mt={15}>
      <Text fz="md">Want to go for a quick spin? Use a random address instead:</Text>
    </Center>

    <Space h="md" />

    <Center>
      <RandomAddressButton />
    </Center>
    <HealthFactorSkeleton animate={false} />
  </>
);

type RandomAddressButtonProps = {
  children?: React.ReactNode;
};

export const RandomAddressButton = ({ children }: RandomAddressButtonProps) => {
  const router = useRouter();

  const getRandomInt = (min: number, max: number) => {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min) + min); // The maximum is exclusive and the minimum is inclusive
  };

  // Random Aave CDP addresses
  const addresses = [
    '0xe996afb92e2a6aabb3588c4bc13efc68ea95d512',
    '0xe9c57881747a62ebf5affbce5fff85842df07dbe',
    '0xeab23c1e3776fad145e2e3dc56bcf739f6e0a393',
    '0xeac4078c050074dc668117385ac014960e1e0bcf',
    '0xeb00ce77c4d4b32c836dbb76156002a7da79c2f0',
    '0xeb2109a191f3b552a38286781b501cf16fb1b6b8',
    '0xeb350d4315fa5332a0efac7c2365ca2e414acabd',
    '0xebe7a232b5855f8f4bfb89228bf4e981c509f127',
    '0xed2a097ad80eeef587796709593c4fdde1e30eef',
    '0xed5d4aa57e28689050eb7de9975d79e0b254f4a0',
    '0xed8b683868dfe6e3495de8f0e9fd02957478c11b',
    '0xedaf58a4a3ee38b3ea6b4462278555fbabc6b361',
    '0xedd19bb3885252f9c0768dc04f3e90f6fe378bcc',
    '0xedf63ac2bfcffcf2b4c9d4a85654dd85aa1def74',
    '0xee8c04704fbecc4aee5014cd625ba68c31902b16',
    '0xee9d6fbdb19ef232fdff03fa7a7c3054745117b8',
    '0xefef171df3d8864c2d8705768096fd5a0eb2b247',
    '0xeffcbe1768341a773d65b26ea804cd1b0aac1e3a',
    '0xf0ae24046492af6e544418ff0e5a9ae61d3824de',
    '0xf0b1966e33fdac9350491c24c0c5d7a8f11bf06a',
    '0xf127ea3435991ef10cb6be24c41ffe68f927c032',
    '0xf24b73a328df29cdde804acf605b8722ad5030da',
    '0xf27e4ebda7b140722b0eb0f4564729c3e8b16e6d',
    '0xf295fcf300f177b8bc57b044b2995a5327f59891',
    '0xf2c48e88f7eea738748224f690b8ff131ccf724b',
    '0xf2e2e8cf79d2976062b3766caabe9fbb15a9c264',
    '0xf37c0fc8affd0acae13b27de0432b7c41e734a51',
    '0xf38c5c71cf44dcdd0a3d5c8513aa8d1e8e4c3c05',
    '0xf40404fdfebd54f03c7495ed71a0a96bd2dc8d93',
    '0xf46e701ab53e18d270fb2c472f2eae275c01bddc',
    '0xf6261d145ec7676dc0e55424b679403f1ca89640',
    '0xf67d9569af280e1f8c1aeb5377ae67659b4881d6',
    '0xf6e6c83ee7db137ed8dadd5d7bbc6b38220a6602',
    '0xf725ac115365d09fd17e26c3ffe62e82b5d79ed6',
    '0xf791d2d64d926839bdfb3fa426c41d0ca014863b',
    '0xf8587bfb4d3e0b31029efa09d595ee6179ddfeaa',
    '0xf888bceb2949198bd065eb8cf1603e268657a641',
    '0xf9210a26278df1fb6fd5ad9d71fc9cde9dc73e89',
    '0xf9320d1cf9f68f951c575f371ccc3d4ec83a7a8d',
    '0xf9d853e88c4c964f68766a4f48ab277e43a99675',
    '0xf9f3782ed2558a904b8f7ed8d1f10aba97a310da',
    '0xfa2479b515686fd5241e97794414aebbfd982416',
    '0xfaa779cc3d28caa7a65ea57e172c19c2e60bb8d5',
    '0xfb0ba02380a269e331d18c68a3704d8a7ec54f88',
    '0xfb7e45a97f77005c750acf1ad0b104547dde4476',
    '0xfc058ab3f45346fab9ed303a587dad583a4b84a8',
    '0xfd167fe0d68bc3810194a7d954565dfacb9beb81',
    '0xfd700870c05eea211401eaed0d9efb96f7ff3fea',
    '0xfd8a63085804dcb95417fe33f9e49253522c68dd',
    '0xfddfff2c1a376ccec92d9efc11ec81bbd73bf7f0',
    '0xfe067b753b7cbb95e5ee05e54932b1edd4301c77',
    '0xfe362ad59094313442ea0a175ba63a12c0855c99',
    '0xfea20dabbee51a0c7cbcd8ec8e0e769182fe6977',
    '0xfef434aeba97673939e6bce74c696f641ae6ed82',
    '0xff5f770d5f43237a53a05c9451fbbaa677c3af97',
    '0xff9b90914e248339ab0a50bf4798ef8b012eac79',
    '0xffc2a7a04143fd9ea93f0af086f2d95803f12865',
    '0xfff6cb60f90582e1aaa444aecbd02f21d087edcc',
  ];

  const address = addresses[getRandomInt(0, addresses.length)];

  const renderChildren = () => {
    return Children.map(children, (child) => {
      return cloneElement(child as ReactElement, {
        onClick: () => router.push(`?address=${address}`),
      });
    });
  };

  return children ? (
    <span>{renderChildren()}</span>
  ) : (
    <Button onClick={() => router.push(`?address=${address}`)}>Try Random Address</Button>
  );
};

const ExperimentalAlert = () => {
  const [shouldDisplay, setShouldDisplay] = useState(true);

  if (!shouldDisplay) return null;

  return (
    <Alert
      mb={15}
      mt={15}
      icon={<FiAlertTriangle size="1rem" />}
      title="Experimental!"
      color="red"
      withCloseButton
      onClose={() => setShouldDisplay(false)}
      variant="outline"
      closeButtonLabel="Close alert"
    >
      This CDP simulator is experimental and under active development. Don't make financial
      decisions based solely on the results of this app.
    </Alert>
  );
};
