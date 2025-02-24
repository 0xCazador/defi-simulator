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

  // Random Aave CDP addresses
  const addresses = [
    "0x488b99c4a94bb0027791e8e0eeb421187ec9a487",
    "0xd2ac55ca3bbd2dd1e9936ec640dcb4b745fde759",
    "0xbbd01f9b63ae317c55b9a6837c51bb2b6394b5d5",
    "0xcf95085403e67b980c01dd4347b4adcf883e6843",
    "0xa87a233e8a7d8951ff790a2e39738086cb5f71b7",
    "0x6b9ee75dbffd6b7d5706991ac7e7ae5363b484af",
    "0x28376b3b5e891ca9aba834e2797a63f061af1039",
    "0x6e96a8f5493d55c3a5cdbf2b2d8e049f812a929a",
    "0x3b3f03015b479b734f41b77dd72851e676d0f406",
    "0x9e14e0476d3fd47b43ea2868b1631bd418298e96",
    "0xd07f497c3d8cb785eef8652fbd98e0f681b31558",
    "0x2574d2367c58a037604d79a5a6ddd5e13603cf12",
    "0xbf68b3ac6f125ee6c98f1cba7d0f217274b21406",
    "0xd1edf7fc3d913c94e6c649985ce36bbc2e871d0e",
    "0xb81780457a6fa7bb92e6edd00de2c5142aa97a9b",
    "0x3562affb5f77572235a7ae7da46f0c8df71a4b1f",
    "0xf0ceeb8aea724dacd5cecdb8e4d4c06f63a7d8cf",
    "0x83c62543ea0b3541438e7c2ac54eef47ea8ed997",
    "0x877f3e62532da273c7d02ab02a6f39f0e8106ee6",
    "0xf76d0835f76aa8f6c041f5f5885b13c374ca2dd4",
    "0x44e8c2451e916c87dde3977dc80f6fb8a1e33b1d",
    "0x855904de035c9d86a301af364159e7237b2536c0",
    "0xe207f98c7ad7f7b3895d4a105453e898771e2067",
    "0x2e2b6070bec9be9f50887cfe306ac6ca93002fab",
    "0x6264b7f05facadaf24b71a96e1df3f46a654b799",
    "0x588b530e0d6d5c15afd56012434752296d70b36b",
    "0x2446beb3905cffbd2c5eb18f1f9c2996b05257c4",
    "0x1778767436111ec0adb10f9ba4f51a329d0e7770",
    "0x0773ba87a7e1df71c547ee75b1fea7cd9749e619",
    "0x5f46d540b6ed704c3c8789105f30e075aa900726",
    "0xf437e7b7c194dbd47586ddd6652a511de529e7c6",
    "0xd07993c6cb9692a71522baf970a31069034df2b0",
    "0x67e254c61b3fc5f5ed92f3004063b21cd0b46b6b",
    "0xd02fe65f8bc8eb870dd337a85c0dd6518a912204",
    "0x28b41cf49c00fe3787cd962feef93238f569c77b",
    "0x7974b46e7940de2c4d6458c053bdbac0bf111683",
    "0x0f922a15561dbad53b8f6ed25be18897e7c5c5ea",
    "0xde4f1b8b87b1a3599c82ef43015df4e9801339cb",
    "0x1f9bb27d0c66feb932f3f8b02620a128d072f3d8",
    "0x91cfbce901ebec39e5fcd4416893a5632b6da004",
    "0x94f74dadd069cbadc6c02ab99eb90dd391cddd9e",
    "0x940df59ba33f3387deff3c2400fecf1286fcce4c",
    "0xac4eba4667eeddb8ec0cf2db062168c4cc07597f",
    "0xeb93e6fc46b78c19bfe3264afabccae410956389",
    "0x39c66b35a98e82968944d2e43b39050e56c6448e",
    "0x13939d994b1a27753de29adddb56d175e846608b",
    "0xcf36a28d7fee8437bed31d52c551d417e6d707e4",
    "0x51ad1265c8702c9e96ea61fe4088c2e22ed4418e",
    "0x98e711f31e49c2e50c1a290b6f2b1e493e43ea76",
    "0x930af7923b8b5f8d3461ad1999ceeb8a62884b19",
    "0x29ab93c6e7024306bc6ba3f2ea739eb7f0228880",
    "0xf5e02171b93fb0eecb750b6b6af9012e0d3aa5e9",
    "0x34bf8dcb3ed8cf8aab57b1d8330cab8ba5246708",
    "0x01d1f55d94a53a9517c07f793f35320faa0d2dcf",
    "0x498411c4f760776c736bdc34684ca48b65ace06f",
    "0x42447172b1479c1128d20558232f9fdd41040d6b",
    "0x9c7fb485d95895941dee77c92ba796fad68f5ae4",
    "0xeb2a1125f1e14822d0708464b795baad6b9038ce",
    "0x8324146852a37975a7100e156531d5503cb51609",
    "0x09cf50574504d9dcf127e848a6058e8e0bb814aa",
    "0x6864156179ca497662f3484381afe961ee5ffb2f",
    "0xd76f1c2764a5f22548713cde767b5b752170d6d7",
    "0xe00e146a5946cacc67d1db5eeb49d9c15e77fe05",
    "0xc026a3d789027b26c2037737192f33a38a7befdf",
    "0x99980d92ebf8ce7e8d9ded4c59391b6e22bd4a5d",
    "0x92d78e32b990d10aeca0875dc5585f1a6f958179",
    "0xebc43f6d73b657c3e4824dce4cec55dcd59439b0",
    "0x9568ef803d55005ad31ff6cd14924b5e0172dd9f",
    "0x75f59c3f1935805a2ac6c93434b8e78b4bb7edfd",
    "0xf4f19e0896ed2f275945514b93c9115d5d2630a5",
    "0x6b03602e4f960d094e3d32731eacf2f438eb33ba",
    "0xa94615f9cfa6ff8e3cb581421ec7803b39d8ae97",
    "0x6398f2612e98c39de1bd54f5e55019e2a6f981ff",
    "0x23a30e9a601b8d369dc46d89ebddc8ce9cc07888",
    "0xa2d1c3d0d603d6f9de6e757bcd1fcdb6ede930d8",
    "0x57426defe97558b6c240d22c07438370be103d67",
    "0x1202e4b8d5f90a46d3dadb2e9b06a702b848de8e",
    "0x46a83dc1a264bff133db887023d2884167094837",
    "0xe2afb2509039117655e2ce6c4d7318b7f7e9c573",
    "0x713a5cb6c5c0ef5e58fca6b09a0a126124f5c240",
    "0x33ed3cbe6f66ed2d40f11ff0f6524995c6f00077",
    "0x8d17c1b895e9c85068fff7f9fa6d35cc3dd594c2",
    "0x9ee75ed4f8950e5b57baccbe2eb5ca0e15226737",
    "0xd062ab63bb4f7af7e59b85defc3c90bfa9b81e6e",
    "0xa0345201ff0b30729b7832155c4ae173cbcafac8",
    "0x1355d905aee0c4e906238a9fbbc60901d3b3367b",
    "0x43de4f2558251c069ddc84dd7357fadba1bfc879",
    "0x2d96401e982190b4cd524d05a2712643928b51b4",
    "0x2f5059d89c3d409917b0d09f95b46c207a8108d9",
    "0x35399be51d70106a75df07830dc3a432562dfb49",
    "0x714f68453ea8cfcf11463d8ee8bc1922a8732eb1",
    "0x2f9677016cb1e92e8f8a999c4541650c80c8637a",
    "0x5d802e2fe48392c104ce0401c7eca8a4456f1f16",
    "0x34705dafdf35f1919904bc3acfc0164432d29312",
    "0xdbd5d31b7f48adc13a0ab0c591f7e3d4f9642e69",
    "0xa9ba157770045cffe977601fd46b9cc3c4429604",
    "0x5837117c453fd3a93805684bb9903c8d93b47b7f",
    "0xe4bef7cfcc9df4721c1498402c16989c1d2e9f5e",
    "0x704ee15afe87130f51e2ed34a87a72590a855913",
    "0xada865e174e7b85535b458b1b5712023969739cf",
    "0xcafac0f66fa5bd6d7a4c57d337eb0586c90c32f4",
    "0x8bf675b7d0b701849eaa306affa55e36a308257d",
    "0x1ff661243cb97384102a69a466c887b4cc12d72a",
    "0x9015dfa64f83ea938812de1997fcd22eeedc3646",
    "0x209861dadf2f094658bfddd1f37fed80cc7577d7",
    "0xb62fb63c6281faa28b011f705570f206cf5c3957",
    "0x2bc55eae1c5c5ff8d4ed79b1eac06a4d350a7c91",
    "0x57a6cce1ee0e24f2af598555a677de8794271c9e",
    "0xb9493f663242c02b404df0eec598e830e25b65b2",
    "0x1dabd4b02fd18c848caf4d656584207438f453bb",
    "0xb081aef14603a6c4d8cef470ffca0d9fef659e04",
    "0xfa82b24951cc3c13872585e2d1ca0665c38b12b7",
    "0x6a757ab1ca76faf151f6b08780682d4043c6e4a8",
    "0xd0479b21dc50a134427f2557c64a3d3c87652ff3",
    "0xe37eeba292e85c5997fb56b1646fdb8d4417d030",
    "0xb51b1aa2d345391ebdc69f1c1b3f6bc38013a541",
    "0xe612e5d6ebfbe1c34da25918efc7f9d2ca06ad3b",
    "0xee7ee50bcab7f072e04707728160c8ec31446490",
    "0xcb773f7c568289d2377f304b853c2d0122fcaa12",
    "0x77261f97af01fb368f7576da5dc2c5f9af93d45a",
    "0x5430d8d72c71b7bab9702fe9c5cca09a1d145920",
    "0x89104002a3c9ed6d764dd3ff8d9f374bd1ed3e5c",
    "0x42903617e67ec52c9127aaa63d50987120160871",
    "0xc860199330a11db7c1d0c2b00eb89be8daa8d9a2",
    "0x56e8eb8e159a0d13a2943d9a67fd90cd7766dddc",
    "0x52004ced0177dc25f2378adfb5f4d64d8516d6cc",
    "0xd46c81245a0582891c2249daf2d68925977cf2a7",
    "0xc9cd150c362f4c10460677bf2cf294f2354d6484",
    "0xab9aba1244ce6b3a479e1ef475053c903d941961",
    "0x99dc2207fe9ac6bc6acd367c1071ebfc9f2c0a57",
    "0x7affefea861d25f2cb012044488a2bc81164fc38",
    "0x5d6d76ee7f1319d988f9f3167772f6ec6cc4e143",
    "0xfb076dc52e7b750fb7779811048993541db4e572",
    "0x96f47cbb5fb486248447f4195490bbe27d865cf2",
    "0x7072ab3af08b0abed638f3dfb7400692633b29fd",
    "0x00a052ffe1a486c88292f4b75b30c875b8abcef5",
    "0xe3d827b0e8ae48789c1ba55b335895398c706885",
    "0xd31290692bbb478c7b1995b50b6f34267fa43122",
    "0xa4c15f743df310ad7c7f3f097e3caf131b220cca",
    "0x8b40beccdfe8e1eb8c87021f4b32ad4c0d7e0030",
    "0x10e47fc06ede0cd8c43e2a7ea438befcf45bcaa8",
    "0x29e1158493c4e435e0a0b177cc80899ba482b8f6",
    "0xb94398189bc31cc7ea7aaae8b2d194488c38e077",
    "0x32c416fc2a641f31b559b6c96e47c4addf420442",
    "0xca72b5d7974dbb87136b49a5c9d7ccd022ece7ee",
    "0xf1a822557048f80624a7f77f0a15acd141c89a10",
    "0xcea48dd0a804b6416cf5163a4b9e67b16130dbfd"
  ]



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
