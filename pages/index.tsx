import {
  Alert,
  Button,
  Center,
  Container,
  Divider,
  Space,
  Text,
} from "@mantine/core";
import { FiAlertTriangle } from "react-icons/fi";
import {
  useEffect,
  useState,
  Children,
  cloneElement,
  ReactElement,
} from "react";
import { NextRouter, useRouter } from "next/router";
import { ethers } from "ethers";
import { Trans, t } from "@lingui/macro";

import { useAaveData } from "../hooks/useAaveData";
import AppBar from "../components/AppBar";
import AddressInput, { isValidENSAddress } from "../components/AddressInput";
import AddressCard from "../components/AddressCard";
import Footer from "../components/Footer";
import { activateLocale } from "./_app";

export default function HomePage() {
  const router: NextRouter = useRouter();
  const address = router?.query?.address as string;
  const isValidAddress: boolean =
    ethers.utils.isAddress(address) || isValidENSAddress(address);
  const { currentAddress, setCurrentAddress } = useAaveData(
    isValidAddress ? address : ""
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
      <Center mt={15}>
        <Text fz="md" ta="center" span>
          <Trans>
            Paste an address with an Aave debt position in the box above to
            visualize how changes to borrow/supplied assets affect the position's
            health factor and borrowing power.
          </Trans>
        </Text>
      </Center>

      <Divider my="sm" variant="dashed" labelPosition="center" label={t`OR`} />

      <Center mt={15}>
        <Text fz="md" ta="center">
          <Trans>Want to go for a quick spin?</Trans>
        </Text>
      </Center>

      <Space h="md" />

      <Center>
        <RandomAddressButton />
      </Center>

      <Center mt={15}>
        <Text fz="md" ta="center">
          <Trans>Create a new simulated position in any Aave market:</Trans>
        </Text>
      </Center>

      <Space h="md" />

      <Center>
        <Button onClick={() => router.push("?address=sandbox.eth")}>
          <Trans>Build from Scratch</Trans>
        </Button>
      </Center>
    </>
  );
};

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

  // Random Aave CDP addresses — refreshed via `node scripts/refreshRandomAddresses.js`
  // (top aToken/vToken holders scored by live userMarketState; collateral≥$200k, debt≥$40k).
  const addresses = [
    "0x46db0650645f7c9a29783c89171a62240ccc35cf",
    "0x0f8dd218ee17eee03d254805f84c7ba613e45e62",
    "0x9cbf099ff424979439dfba03f00b5961784c06ce",
    "0xf7462251c14d2fb83c7ab96367a7985423c83010",
    "0x96c9487af21d18ac5f4c841af44a011968445709",
    "0x72655b3926db3afbe914a53b0604905af7ce11a5",
    "0xfdab4d4fd0f6fbe4033955faad0e9dd00ec00407",
    "0xa3d843b6a057504284006bef6f34a2e9bc80fb6b",
    "0xb329504622bd79329c6f82cf8c60c807df2090c4",
    "0x3f60008dfd0efc03f476d9b489d6c5b13b3ebf2c",
    "0x57b0266f2836f5244f5906d62486fe93d5fa210b",
    "0xbfef061243c3da14d20aa9cb054350a9192d3a93",
    "0xb7a0c5813a5e4eacc49e1095d2329e9b277fab5f",
    "0x47ec0f9a416106f953f91ebab103c8b81fa50d6d",
    "0xb32cb14f2a5b17d1f1343749e302316be5133321",
    "0xfb74196eccf35a260dd5cfd300baa37ae058b6c0",
    "0xa6fbeaac65de6d6fc900d95932d9320aad9128f0",
    "0xf03e3440f5f382dd65467784bd5411a0c1378d4d",
    "0x481c7823e54f000aa278bab4c001971177737aec",
    "0x5a67a213718769e85ef8000c90e14708721f381c",
    "0x3d6c8c147d0033d1615cfab698e4f9a55f273206",
    "0xe894575004113373d68535ee8e0b7e880278dcf9",
    "0xad9d3a03648dbcc27aa458238474a1ff88234acf",
    "0x03b99c3d4ea494551b8c02709b006a0b71fefcad",
    "0x856565db827588a88780454863f98a4a323e13aa",
    "0x24a2535c39242c11fe99fd8b690bf81ab23d9576",
    "0x04903c4c148dd276555df99fb16fbf1708a43a19",
    "0xc1e01fb99823de3c28174fcdb7e3556758c9b02d",
    "0xc8d0003a00bdee07eeaa4dded0fc590fb9a6bae4",
    "0x25175bb03c8384dcf83a17a857cafa08eb94c2de",
    "0xf0bb20865277abd641a307ece5ee04e79073416c",
    "0x9600a48ed0f931d0c422d574e3275a90d8b22745",
    "0xabdbbd00fad79b257e7313b398a1ea10d9eef8d6",
    "0x893aa69fbaa1ee81b536f0fbe3a3453e86290080",
    "0x7cd0b7ed790f626ef1bd42db63b5ebeb5970c912",
    "0xf34d97c680803358a468e3c56337defaf85ca6da",
    "0xc468315a2df54f9c076bd5cfe5002ba211f74ca6",
    "0x99926ab8e1b589500ae87977632f13cf7f70f242",
    "0x28a55c4b4f9615fde3cdaddf6cc01fcf2e38a6b0",
    "0x741aa7cfb2c7bf2a1e7d4da2e3df6a56ca4131f3",
    "0x7ee29373f075ee1d83b1b93b4fe94ae242df5178",
    "0xe40d278afd00e6187db21ff8c96d572359ef03bf",
    "0x34780c209d5c575cc1c1ceb57af95d4d2a69ddcf",
    "0x40e93a52f6af9fcd3b476aedadd7feabd9f7aba8",
    "0x7bee8d37fba61a6251a08b957d502c56e2a50fab",
    "0xe84a061897afc2e7ff5fb7e3686717c528617487",
    "0xd848f54280f8fe8661b796e3bb8d8922c87af452",
    "0xcf0a12cbd8088fc5f84ad431e71787157041cd69",
    "0x7055b17a1b911b6b971172c01ff0cc27881aea94",
    "0xda43cce1263c1b8c8bfacf517fc7dd19d7dd41bd",
    "0x0a0fa2b02ae73bd9eb4c1e086458099eca42476e",
    "0x973ddb8ee2c9cc87e853c8d46253840c63951683",
    "0xdc3abf85e090528669cf1b44ef4082b269c21a95",
    "0xc3fe8b63ea05e8e27b3f3358d646915d7ed931e4",
    "0x755013a759c6c56d95b687ef4b2b9864f3654e60",
    "0x2bd72f8fb377337c9cc16da4dd2dd274537ffb82",
    "0xabbd5b2b0b034781e58434736728b9d0673de7f1",
    "0x0591926d5d3b9cc48ae6efb8db68025ddc3adfa5",
    "0x6142eb927529974c5cded66dafc57cb5aaaf73ab",
    "0xba20c11a14c7f41589785cd6fc1809b03bd58ecb",
    "0x34d1231f15da58762a84ead35242896e7fec4ac1",
    "0x42715ba91deda3c692b9f540cee2fbb4dae78bbb",
    "0x2269ce2753e2967dd5322a56188c3d24435b3588",
    "0xed0c6079229e2d407672a117c22b62064f4a4312",
    "0x28355886a65848488cf0a3646fca395db0a762b1",
    "0xd8495b95a3a6a85f4e3baa003e8b7ed1ed85562d",
    "0x0a42b2f3a0d54157dbd7cc346335a4f1909fc02c",
    "0x26a58af72eff53ddaa064a9df86e8ec3184bee95",
    "0x1b36972588d214aea7b8f5322f349246bf571cd6",
    "0x7f6d23e436099ec78a73c430b16782b0d68585bd",
  ];



  const address = addresses[getRandomInt(0, addresses.length)];

  const renderChildren = () =>
    Children.map(children, (child) =>
      cloneElement(child as ReactElement, {
        onClick: () => router.push(`?address=${address}`),
      })
    );

  return children ? (
    <span>{renderChildren()}</span>
  ) : (
    <Button onClick={() => router.push(`?address=${address}`)}>
      <Trans>Use Random Address</Trans>
    </Button>
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
        This Aave debt simulator and liquidation calculator is experimental. Don't make financial decisions
        based solely on the results of this app.
      </Trans>
    </Alert>
  );
};
