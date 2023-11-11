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
    "0x7902d79ada34e3cb32a3faa5496334a004589925",
    "0x5de64f9503064344db3202d95ceb73c420dccd57",
    "0xbebcf4b70935f029697f39f66f4e5cea315128c3",
    "0x06e4cb4f3ba9a2916b6384acbdeaa74daaf91550",
    "0x4196c40de33062ce03070f058922baa99b28157b",
    "0x790c9422839fd93a3a4e31e531f96cc87f397c00",
    "0x7f67f6a09bcb2159b094b64b4acc53d5193aea2e",
    "0xe705b1d26b85c9f9f91a3690079d336295f14f08",
    "0xab92fca834aac2afe16cf6a2fc60cc7a864a77a5",
    "0xb0898b883de7f7f49ab8622f2185f5d0ca25b2ad",
    "0xee2826453a4fd5afeb7ceffeef3ffa2320081268",
    "0x63503af6c43d949d9fa6c1b13f38a149e040a39e",
    "0x42c8e43048f6ff3586945a1fd23e0bec540dcd07",
    "0x0301e6c63f3b9cf869e77996e287ca217c6b5521",
    "0x6e96a8f5493d55c3a5cdbf2b2d8e049f812a929a",
    "0x4d17676309cb16fa991e6ae43181d08203b781f8",
    "0x41339d9825963515e5705df8d3b0ea98105ebb1c",
    "0x935ad0fbea9572bb24138f23a69e314f0bdbddbe",
    "0xe466d6cf6e2c3f3f8345d39633d4a968ec879bd5",
    "0x13939d994b1a27753de29adddb56d175e846608b",
    "0x1f244e040713b4139b4d98890db0d2d7d6468de4",
    "0xfea3f5b06d41cb1526b9caf8be63c5b37c475f23",
    "0x1749ad951fb612b42dc105944da86c362a783487",
    "0x2f983ce84cae1b722de90d91cfaaefb20105f568",
    "0xd76f1c2764a5f22548713cde767b5b752170d6d7",
    "0xbbbc35dfac3a00a03a8fde3540eca4f0e15c5e64",
    "0x3d57b83154423edb0ba0e747b03858e69075fca1",
    "0x3d10ed16c911cd22d100cbc00165c918a2df66bc",
    "0xe19f8244f04001fa01bb55f401e29426e2f67155",
    "0x8429eaa03f90bd6dfccc64863d02a9c34ae81187",
    "0x7c7770d9c77899325d57b41880df70c82bb685c2",
    "0xb6bfa0017b912290ac0266a34c43a934e15454de",
    "0x94e96e1b9b8c7ecf8ddb37a379e6bbeffa057c93",
    "0xc9731964712a6acb702340c18155ea65d5b9c037",
    "0xe84a061897afc2e7ff5fb7e3686717c528617487",
    "0x9df8dd68c73b096cd9c0c4963fe89613df40a1cf",
    "0xbd677550b8e9b96e3e410bc549aa4768bb11a848",
    "0x8af700ba841f30e0a3fcb0ee4c4a9d223e1efa05",
    "0x6264b7f05facadaf24b71a96e1df3f46a654b799",
    "0x4c14c8f88eea50eb30dc4b2a035327146578c58f",
    "0xa19085a92de036d782d955555d1b35b239992731",
    "0xdfad3e4f73448f5c066ddb4dd5dfa4e60e4a4cba",
    "0xc9cea6df3a736846c5b610ff342836838ec1a84d",
    "0xead9623a385c301b166f3740a2973d05f1d190dc",
    "0x6286b9f080d27f860f6b4bb0226f8ef06cc9f2fc",
    "0xa953199f569b65977b649c428df7883cb2378e13",
    "0x597568694fe6ee1b701ec8578bd57102c9a29abd",
    "0xe678cf140014dace8d12d26b7c0369a0db7d5429",
    "0xc76f39917e38426515ed15376e0b518574e67f05",
    "0x6abaaa0b6be7badd867964e2273600cad415fcae",
    "0xbe75df33cee7032f50b33b9c485ed30cc293ad45",
    "0x93a72b6cb640120ceabf3948506b16a96bbd45e0",
    "0x15ae76920e6c3570e13e443677a0503e6e95bf79",
    "0xd07993c6cb9692a71522baf970a31069034df2b0",
    "0x8e7f30e5cf6bfc2ca2e54bbf96a6d866fc03ff60",
    "0x78e4588e041611347710f4767352bb11c7ef7fdd",
    "0x6833df4e1edb361a04491349833c83a4868abcda",
    "0x3f3e305c4ad49271ebda489dd43d2c8f027d2d41",
    "0x7d71a3ad24752641305c127e575a6b44b5a5e6d6",
    "0x0773ba87a7e1df71c547ee75b1fea7cd9749e619",
    "0xf91dc62ecb1d2cfc6ee72e1e7a27288c20bb5486",
    "0x0b5a6a15b975fd35f0b301748c8dabd35b50d8c5",
    "0xb77f7c90437a6d9871a4ce4f48698a9e2dcd56be",
    "0xa447b855719c3114545b10b29aabcc4955f99d67",
    "0xb8ec7c6483444572a486e22dd8f875bb26e14472",
    "0x4860d039cbc7cffb0267f86e63f4b4442b71505e",
    "0x9f25779098c5632da2ec55d161c4e5f2afc4e0ec",
    "0x39c66b35a98e82968944d2e43b39050e56c6448e",
    "0x7634049875381b273abf264e1eed5ba164b44281",
    "0xcc4081f3c1257229759e956dad9140137329b7d8",
    "0xd14f076044414c255d2e82cceb1cb00fb1bba64c",
    "0x280e93b4d5e7dc852332a41e93c3329052d40e8f",
    "0x08d93188c4c439651993f0c6656ed1253238e451",
    "0x0d40d9578e1d86abdaf7ea02d0c53d53cba320bd",
    "0x39be632bfc5a74183ffe124c60e248138e496bc4",
    "0xa6fbeaac65de6d6fc900d95932d9320aad9128f0",
    "0xd075ca0b40d67db2570ae23936baeb64449dc8ba",
    "0x0ffeb87106910eefc69c1902f411b431ffc424ff",
    "0x91746d6f9df58b9807a5bb0e54e4ea86600c2dba",
    "0x13f210c8baf5f5dbaff3e917e2e5a49e73bbaf12",
    "0x4127143a866bf5d8ad2afb6de8e63164b8ad5bf6",
    "0x7b604c0595612344a9c62e09e2fb098ff8f22efb",
    "0xa0eac5d90be5e6346b22895a207d49fbe9711447",
    "0xafe1e2b350b3c9c8540634cda1e7e91f2f7a8458",
    "0x20149621fb7fe93306d0ffa4e3b14b700e4c5e8a",
    "0xc918f7496689e60a5f42dd14b75486aee87f184e",
    "0xc89c3f23994a90491972bf98a57e5ed25bbf632d",
    "0x4a5e7e97a7374bc9e802c19a599c16c0af077aa3",
    "0x0e66cf7a7e7a7f4574670f6c2c9d463e1478a06c",
    "0xc0944d70a81e84a80dbcafce34cd662a4d894587",
    "0x97b418f3f1abe6810bed881cfc298491f4b93bf6",
    "0x1724e18fca576e0720692df03ace7d97443f52bd",
    "0xe357b511804f52e5ad27e8a8e09f4884e893bf99",
    "0xf8d921bd839381e935164ce266c4ec1e75a5e9fa",
    "0x8581def657860bf58a5b0d6d2d357b51b81655b6",
    "0xd8aca8644358d79a4cd132ce5cf72611856a26c9",
    "0xeeced68bbf354bee0ae8222be58e70aabf582827",
    "0xe894575004113373d68535ee8e0b7e880278dcf9",
    "0x452a8281853e412eaf9538826f48de00e166408e",
    "0x481c7823e54f000aa278bab4c001971177737aec",
    "0x9402264333a46a1e7fc3fa4093fde6429cfb8949",
    "0x852610c4bd327c9c7fd93e06505173092f29a39c",
    "0x052478a0e5d861a0c75aad015436ffbd94d529fe",
    "0x51b8bd8104439f243eee1874caab7fb49cd27ca5",
    "0xcf4f9da7f2b2cd45e846192d9ea27d95614ddc06",
    "0x9fba5259a1a4654212849e87cfdf5b28d5bbcb5e",
    "0x3f7c10cbbb1ea1046a80b738b9eaf3217410c7f6",
    "0x3465d93b84ed7557d42d84cb7c8999fc3db2113d",
    "0xf8e245acddb070bdfcd8852db06eebbabea0b772",
    "0xee88442e9d2d3764ac7ab60b618cd73cd9a5fa51",
    "0x585b5de22e1e18f65f17987b3f1b7996465c57b2",
    "0x763c823e2bdd66538c85736b1784031fa4d993f6",
    "0x60e38511da2c6ba55272d1df5fd247182a6ed904",
    "0xea211c5b5009b59e9537de4f66ed144c741ef503",
    "0x963d071201275fd5fa3dc9bb34fd3d0275ba97a7",
    "0x83a59ce2ef545c019e77c542552ec0f0f58402b6",
    "0x411aa2a7981bc31abac984b4c2bb141015919f71",
    "0x5adc5db87039735106b4ce6115867d6d17ee789b",
    "0x61a9704e6fb36e59e4516b8cea71b2a705a85c94",
    "0x96bf1e85eecf3b971a3e1ebc88bd4efe3f8698ee",
    "0xb6e0928537289164cb0d11969cf7b9fcd2c9982a",
    "0xcd22a3962a067472b335cf2564365c3034bc975b",
    "0x17ede21b60c44a0139968e0d1d9a001d2bdc8f85",
    "0x945d5bcda8dcd9cd8b221fd23cf4b6c0e7e50bd5",
    "0x138db60b0c4aebc65970038f454cb219985c7351",
    "0x815400bf42a37af49f0229b502a15c880ad14ad2",
    "0x089b95152253b6af73e7f7267d749058d56ce231",
    "0x72ba97ee7d728f5528894c4faee97e8abf2fd87c",
    "0x8f009a96f45514c31ee806fba7c4bfb842ff497e",
    "0x697fe00ee11d5f6bb2011caa4da4cfee147b9e42",
    "0xdf72ed2e8ba97639efa0dada92f3a46d22a501aa",
    "0x82d24ef70c3f44c9ac870910557eee04e3116a26",
    "0x4f04b9a66e27e1d434c94f4aeb6034cb24879464",
    "0x9a23f67a3e260e737ac52479ab577c0f49144d47",
    "0x3a140a232e8d752a7dc7796e48416c16d653ccd9",
    "0xc0b1da7848e5294249596d60eccb0aec82fab19c",
    "0x223c381a3aae44f7e073e66a8295dce2955e0098",
    "0x7923457858043cd093b5b07be5976bcc33d44c9a",
    "0xd84bc467a6642b11c3df7001bf94485c742844a1",
    "0x2b5424e93a8c4bc34af2add611492c1413210075",
    "0x033e036bda697d7a7615dcd04cf7f1883904fc6c",
    "0x021daee385bd0acb6d72c05b03abc1bc81f64970",
    "0x5926144d88220380956dad271fa10010e45f8cdd",
    "0x02fc861c4b8fd045ce9f58db34dba48b268275bb",
    "0x5c0843066f64aa0d9858611401cd2dd6f2e1f7e4",
    "0x6f3ba92859bbf2a68bc083c7de0bffc0db6ddecc",
    "0xb86cd2efc1f461beee8deec2c3f053ccb2781ef9",
    "0x646985bbb677653e5768139d354ca706f1858fcf",
    "0x78696a78d626db13fe02a878f15b5309f3cf820b",
    "0x91746d6f9df58b9807a5bb0e54e4ea86600c2dba",
    "0x5de64f9503064344db3202d95ceb73c420dccd57",
    "0x98b221a032f525a9fa2107182b06630e4a7aab89",
    "0x6286b9f080d27f860f6b4bb0226f8ef06cc9f2fc",
    "0x14c32a94d825b0fbfc1a7024282f6bcaaa3082d1",
    "0xab92fca834aac2afe16cf6a2fc60cc7a864a77a5",
    "0xe88ab6fa7f02c3ed96985de5e50cca7ceea54d4e",
    "0xc0ae32b3c0d37d52427001d26c6cbd3ba8797e7c",
    "0x47346c16a52e2f6b654daf69835b0186aca11bb9",
    "0x3496c181777458f350a560cc795b419ba61dd543",
    "0xac2827a29dea9dafbf5c2ac3db0b8e2fe76d19db",
    "0x35ebe8ff4e3af0c741f4f839f73ce4aa01c47a79",
    "0x34779a91f630289431eeb30550c6463a51a23c4e",
    "0x3ee505ba316879d246a8fd2b3d7ee63b51b44fab",
    "0x58a9bba29d0201f5e285226792386c78e94f1c27",
    "0x3389cd9bdf52f3d679d4e19ad845672980d1e700",
    "0x5356df73b293bd9c6e8efd22c99833391ef8821a",
    "0xb2943ff4cebdb48c5772285626b60482558fc66a",
    "0x0320e2787d5c62a4a81f219dfb3c5abdf6265362",
    "0xf654cbd0d7b1765091b035bbb0205dd4b6b49c7f",
    "0x6b1a6b0f1f65547b867697841c9d208da6279003",
    "0x8cfa7c6fedc4dfec18eba1aa09138147f4cd3842",
    "0x80b3153f39aeec1ef68adc038913698e103e6e1d",
    "0xec6320c55202cdfc71a9c7eca8d2f4bd7fe3a037",
    "0x1a9836f6dcc253332ee707bd9808ab3d79d973d5",
    "0x9824697f7c12cabada9b57842060931c48dea969",
    "0xf9869d4ba1260a47303ce5b34f27983475ce2160",
    "0x1cc221d84a0c1621ad6b462a84d1bd69c5b94a58",
    "0x42a82de905239e0c5e584e0c80d7a15825b9c190",
    "0x7c601f2c87406a9c1e3baea46644eccce8cdf723",
    "0xf8d921bd839381e935164ce266c4ec1e75a5e9fa",
    "0x4e76cb80358f1a7b6595d434ffbe1d919c89d7ac",
    "0xe9f3ba9d53ddb1dfb39e391476ee046c817e2326",
    "0x4b2a62efd6cc5a0714be3754dc4c71893bb26edb",
    "0x225802317e1ab01918bcd0f8b6e83e81ef9a53fa",
    "0x5b7ee19a02c20bd7f28fcaf8dd4dde25b03b6894",
    "0x93a5b25022ad5ac93dc13dffd1c5c5269153b154",
    "0xe4c5557a1f859874d5e124747ef5881a449f9712",
    "0x1de5366615bceb1bdb7274536bf3fc9f06aa9c2c",
    "0x997f67ee0934db865b0101c597c16b8c30d0139f",
    "0xe41a2b194f15aaae7500421ecb71e39c5be26bfd",
    "0x544a40955ba1c7e56e161a59e1319e3313c25251",
    "0x5aadb7a698bba2ac19b52877bb60a436a9965fa5",
    "0x77261f97af01fb368f7576da5dc2c5f9af93d45a",
    "0x9c5534b8a759bb527ee00de5d698140cf991816f",
    "0xb16928faaa41b3e86bda0e8923fbaf4a00adb04a",
    "0xcd0535b64b0bd4c1699843c68937d9ba0a2d29ce",
    "0x6f520ebec62a868ab354deef3c1d5ebdffca29f6",
    "0x97b418f3f1abe6810bed881cfc298491f4b93bf6",
    "0xd36ac1b46cb03aedf8604507301d7f3ff6146566",
    "0xd0e5c02ca0f8e613b61298bc90346af6bb944eb7",
    "0x86b4d4a8c620537f67013fddeae2c74f28360e8e",
    "0xfd37cd24ae0d604bbb8a51d06be83de4d4cbf4ba",
    "0xd8f6398d1d8abc9adfede2f8d8c0fb641d9e4734",
    "0xc9c8a2ae2354a97e737301133fcd2f95de88529b",
    "0xc3ee6ddf545e31c68c9a6299098b51fe4db52cd6",
    "0x3b3420e1c63ef202831c42f137c29c81445d841a",
    "0x1180814ef4dd32106b9de7f3c172795cea3c3d6e",
    "0x562a194685c47ef2b5167a38bf8ed79b2d453071",
    "0x8581def657860bf58a5b0d6d2d357b51b81655b6",
    "0x9e8a101592d6931eb3198bc3ff7ebf95a1e8a836",
    "0x943ab19f3312f6a1a1ca4e1a8bef2452185974f8",
    "0x98ed1eae1836fa93a20fa389fc386ba75bd07d5b",
    "0x7451d7dc1570f2be4aa3eca8d482dff117570ab7",
    "0xdaf273d37a0b4d81817e3e465d6710fd50efc6f6",
    "0x3cf501a0ee4f2eb2ee773f6ae6f3e48855c3a2b1",
    "0xb128ef57c95cb8fa694eeb8eb53afc11aadee83e",
    "0x1216cd2e4e48b6b966b788643ce8c1a21386d2a8",
    "0x718cd461fce91a11d002dbe1a6a0f9f2a9630ae8",
    "0x0ca634bc2b591b557a6ffb39d8b8718e7f36dafd",
    "0x18b5be29483b436b991a974098da1832332b21d7",
    "0xa85ac0e2baf754bdae8d2551067af79a4530fa77",
    "0x80ec983364238687dce2580736a9b5b1aae662ce",
    "0xdfc0f2333eab608432960e07f4df79df694ea778",
    "0x1e5b92c66e4cad7963e8dacf1e8d642304c172c8",
    "0x40e388b0e3aa56577c0820f33d4cf62223898bbc",
    "0x97a9fb8072af1bb71dc0388c1186a4b9f67db6ef",
    "0x856565db827588a88780454863f98a4a323e13aa",
    "0x9dd1b9fd454c059abba14c32f16fb93bf579a4ca",
    "0xa2dcba7068d62bf5389bcd1a11cab502a2d3bca8",
    "0x943ab19f3312f6a1a1ca4e1a8bef2452185974f8",
    "0x4c3f9010c431db16bfd05a224e6dbaaae1429e18",
    "0x4bce54f2303aa4fcdda8cfb96e6ca6eaede8df8c",
    "0x696f67e27ee8d043b28a580b53331932585b5fcb",
    "0xa7340035fb2c1e440a5f990bbc349b41e1f4d4cd",
    "0xfb3c01f90b4629dbd4fd5310e995ef3fe2e7abee",
    "0x54a85cfdb41f0b4f9001b4837e594940d375ed37",
    "0x522dffc539c264a8f7e0b91102e899b33f4dabc3",
    "0x04903c4c148dd276555df99fb16fbf1708a43a19",
    "0xd5d770f00083649603f31137527be3f9cd2041cf",
    "0xcaf744e0f6d8dbd082cf2f86028f2e1abfc7befb",
    "0xfef7ddaae3e406c3fd5fa0a731c5adbae7afd7fa",
    "0x72fad4173180f58e0d2c964f160d383cd454ff79",
    "0xe65130c719584a68d48e2968e79e19d5daf1e983",
    "0xd6eb20c1c54922d9a9fbdfae198464fa12722c04",
    "0x233ae291a47ec5bc08484609c368cc44f8b87775",
    "0x87a9cdd1fdaff1b9bb255e0b19292172eac30851",
    "0xed41f5967252248412e6c69475ae8a5a4274a6f8",
    "0xd3aadf36b6a202f2bf8d689a508990f6042eee77",
    "0x497f035d1c29cbfb3fafe8c424b2aff7ddd15f88",
    "0xa989f464c2a76391d749e5d4aba3d9f470952c80",
    "0x706289eb7a2d10ef50f6264a89eaab55b5847e90",
    "0x5f61a41388ef3b0182adad4415ff684822182634",
    "0xfe55c0ec3642fc79d4eb2c591a0641f187fb0337",
    "0x99cbb867ff038057dda7b78e5f7e5beadbe3bebb",
    "0xdbedb1b7d359b0776e139d385c78a5ac9b27c0f9",
    "0x5acdabec96c1d2bc16c030b7dd98d2a8d669dc98",
    "0x8f243b3c567248fcf9c820caf8d073243b2533d1",
    "0x6e55ea366a7d27221f9e090f5527968af72be19b",
    "0xddc60d163015cf5ca1369d557a2ca1cc2de1f1e3",
    "0x28aeab635aaf4f68d0f88834c8637174257d942c",
    "0xcf7db6b0d566d4912e6cd04af435b82a36fc4d85",
    "0x91f74306818231d54619bcc77dbbbc4e784a5aa0",
    "0xd760ef23c9a203bd3718e91fc08b412ed49c5846",
    "0x9e3471bf5f07470afc521a41f17bee4764931268",
    "0x1b89caeec45ecb265450c280cefd67c964004f46",
    "0x4e287e1271630757424e06192943ed19df553b41",
    "0xca70947e6b8265d531408e470de1429003171478",
    "0x10a1ddb397051d4cfa7dabe04c865b823008008e",
    "0x60a6d69802239e8678f35cf3cff8af6d64ab4088",
    "0x39be632bfc5a74183ffe124c60e248138e496bc4",
    "0x465212bdd566c5b64e797cf5e67387f2a9643539",
    "0xff7afa1153c4d56756000b29ff534f309129ac26",
    "0x995c06b04fc53211110d02bdba73301c4990ebf0",
    "0x11cb0ab71efb64eca1d802b55f4a07857a15f039",
    "0xfeed6ebeb28106a1be0e524996e18c92bcc06d27",
    "0xe6fa7a5d3538ca68b2272bcf9666faf31f274815",
    "0x38f5e6772e426232d9a99e04fe12c4c2e1913cd3",
    "0x4d7592eaeaf845d8e7e4a6d5042a25265c4a33a2",
    "0x4cb0bf296cb9e790456088802759ce16bd942ab2",
    "0x1a34edac6ab1cf8fe609f163d798c8644636c7dd",
    "0x4b010aaff99e863891ec00dd6024432f1429b88b",
    "0x827c691f829a34a2d7b7ad31d77a0c9b58feaa4b",
    "0x476551e292547c70bb27307d87df54baeb0f644b",
    "0x8cd40a5ad8a408ec245061566229ba8ff4c327f5",
    "0xfdf020873c7635f5334deced0c8fde7bf2f37439",
    "0xd006e82f8503cb0c0e1f790510c0064208e9f9a1",
    "0x77e1c23190794ed04997819d50585dd33e8c5c0d",
    "0x14f4895aa65b5df634f8b75893c3e7ba2bbbb093",
    "0x25e1640f272628c787400a9ae45013caff6a60c7",
    "0xb432c276265a8eff41d04acd36983d8bc6b2eb16",
    "0xc3ee6ddf545e31c68c9a6299098b51fe4db52cd6",
    "0x2d759e9e4c1bb2a5d175faf2ed9f83712ac2b81c",
    "0xa96b4fcacae1d4284774ddf3692101e5411e9137",
    "0x055acb1b90797996b4fa1f7605e74b84887e3821",
    "0x21cceb8a7f4ad404ae65f8c463cccd6af6794563",
    "0x8cae73211adc9495a4337c3ac3482c8adab1a71b",
    "0xcf29992989453dff7733caec52f75e6b0a8f5f33",
    "0x7c3bdc47ec3e1d28ceac3f8d556852220ef2e150",
    "0x3d713067761725e6a237e5a0572aa47348eafe3d"
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
        This Aave debt simulator is experimental. Don't make financial decisions
        based solely on the results of this app.
      </Trans>
    </Alert>
  );
};
